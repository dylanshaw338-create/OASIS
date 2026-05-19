import { net } from 'electron';
import { SemanticScholarService } from './semanticScholarService';

export class AiService {
  /**
   * Handle AI Chat communications with MiniMax API
   * @param config Configuration containing API Key and Model
   * @param messages Array of chat messages
   * @returns The AI response data
   */
  static async chat(config: { apiKey: string, model?: string }, messages: any[]): Promise<any> {
    const { apiKey, model } = config;
    
    // 注入找论文的 Tool Schema
    const tools = [
      {
        type: 'web_search'
      },
      {
        type: 'function',
        function: {
          name: 'search_academic_papers',


          
          description: 'Search for academic papers. Extract ONLY the core academic entities/concepts from the user\'s request. Translate them into highly professional ENGLISH keywords. Do NOT include conversational words, verbs, or database names (e.g., remove "find", "papers", "authoritative", "ACM", "Web of Science").',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'PURE academic keywords or exact phrases in English. Use double quotes for exact phrases (e.g. "\\"Human-Computer Interaction\\" \\"Virtual Reality\\""). NEVER include words like "papers", "authoritative", or database names.'
              }
            },
            required: ['query']
          }
        }
      }
    ];

    try {
      // 第一次请求：将用户的意图和 Tools 发给大模型
      const response = await this.callMinimax(apiKey, model, messages, tools);
      
      const responseMessage = response.choices?.[0]?.message;
      
      // 判断大模型是否想要调用工具
      if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
        console.log('[AI] Model requested tool calls:', JSON.stringify(responseMessage.tool_calls));
        
        const toolCall = responseMessage.tool_calls.find((tc: any) => tc.function?.name === 'search_academic_papers');
        
        if (toolCall) {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            console.log(`[AI] Executing search_academic_papers with query: ${args.query}`);
            
            // 执行本地服务检索
            const ssApiKey = process.env.SEMANTIC_SCHOLAR_API_KEY || ''; 
            const papers = await SemanticScholarService.searchPapers(args.query, ssApiKey);
            
            // 构建带摘要的纯文本给大模型，保留核心字段
            const simplifiedPapers = papers.map(p => ({
              title: p.title,
              authors: p.authors?.map((a:any) => a.name).join(', '),
              year: p.year,
              doi: p.externalIds?.DOI || '',
              abstract: p.abstract?.substring(0, 300) + '...', // 截断避免超 token
              citationCount: p.citationCount,
              publisher: p.publisher
            }));

            // 将大模型的原始回复追加到历史记录中（必须包含 tool_calls）
            const newMessages = [...messages, responseMessage];
            
            // 将工具的执行结果追加到历史记录中 (role: tool)
            newMessages.push({
              role: 'tool',
              name: toolCall.function.name,
              tool_call_id: toolCall.id,
              content: JSON.stringify(simplifiedPapers)
            });

            // 第二次请求：大模型拿到论文数据后，进行自然语言总结
            console.log('[AI] Submitting tool result back to model...');
            
            // 注入后置的白名单过滤逻辑（避免污染首次搜索的 Prompt）
            // 注意：Minimax 等大部分 API 不允许在对话中途插入 role: 'system' 的消息
            // 必须将其作为 role: 'user'（或追加到现有的 user/tool 消息中）来传递隐式指令
            newMessages.push({
              role: 'user',
              content: `[系统级指令]：你已经获取到了最新的论文数据。在向用户推荐时，请严格检查数据的 publisher 字段。如果它不在以下白名单内，必须在回复中明确标注：“⚠️ 注意：这篇论文属于 [XX 数据库]，目前未在机构采购清单中，可能无法通过直达通道获取全文。”\n\n白名单：[Web of Science, ACM, IEEE, Springer, Elsevier, Wiley, Oxford, Cambridge, Nature, Science]`
            });

            const finalResponse = await this.callMinimax(apiKey, model, newMessages, tools);
            
            // 我们改造返回值：除了大模型的最终回复，我们把结构化的 papers 数据也强行塞进去
            // 这样前端就可以拿着 papers 数组直接渲染卡片了
            return {
              ...finalResponse,
              _injectedPapers: papers // 将结构化数据挂载到自定义字段下传递给前端
            };
            
          } catch (toolErr) {
            console.error('[AI] Tool execution failed:', toolErr);
            // 如果工具执行失败，告诉模型失败了
            const newMessages = [...messages, responseMessage];
            newMessages.push({
              role: 'tool',
              name: toolCall.function.name,
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: "Failed to search papers. Please tell the user to try again later." })
            });
            return await this.callMinimax(apiKey, model, newMessages, tools);
          }
        }
      }

      // 如果没有触发工具调用，直接返回模型的原始回答
      return response;
      
    } catch (e: any) {
      console.error('[ai:chat]', e);
      throw e;
    }
  }

  /**
   * 封装对 MiniMax 的底层网络请求
   */
  private static async callMinimax(apiKey: string, model: string | undefined, messages: any[], tools: any[]) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'abab6.5s-chat',
        messages: messages,
        max_tokens: 4096,
        tools: tools,
        tool_choice: 'auto'
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    let data;
    try {
      data = await response.json();
    } catch (jsonErr) {
      throw new Error('API 返回了非法的 JSON 格式。可能是网络代理问题或服务端错误。');
    }

    if (!response.ok || (data?.base_resp && data.base_resp.status_code !== 0)) {
      throw new Error(data?.base_resp?.status_msg || `HTTP Error: ${response.status}`);
    }
    
    return data;
  }
}
