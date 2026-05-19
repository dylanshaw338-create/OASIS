import { net } from 'electron';

interface CacheEntry {
  data: any[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function to reconstruct abstract from OpenAlex's inverted index
function reconstructAbstract(invertedIndex: any): string {
  if (!invertedIndex) return '';
  const words: string[] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of (positions as number[])) {
      words[pos] = word;
    }
  }
  return words.filter(w => w !== undefined).join(' ');
}

export class SemanticScholarService {
  /**
   * Search for academic papers. 
   * Migrated to OpenAlex API for superior data quality, relation graphs (for Obsidian-like linking),
   * and high rate limits (100k/day) without API keys.
   * 
   * @param query The search query (must be English for best results)
   * @param apiKey Optional API key (ignored for OpenAlex)
   * @returns Array of paper objects
   */
  static async searchPapers(query: string, apiKey?: string): Promise<any[]> {
    const cacheKey = query.trim().toLowerCase();
    
    // 1. Check Cache
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log(`[OpenAlex Search] Cache hit for: ${query}`);
      return cached.data;
    }

    // OpenAlex URL with filters (has_abstract, works types, etc.)
    // mailto is used to join the Polite Pool for faster/more reliable access
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=has_abstract:true,type:article|proceedings-article&sort=relevance_score:desc,cited_by_count:desc&per-page=10&mailto=dylanshaw338@gmail.com`;

    let retries = 2;
    let delay = 2000;

    while (retries >= 0) {
      try {
        console.log(`[OpenAlex Search] Searching for: ${query} (retries left: ${retries})`);
        
        const response = await net.fetch(url);
        
        if (response.status === 429) {
          if (retries > 0) {
            console.warn(`[OpenAlex Search] Rate limited (429). Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            retries--;
            delay *= 2; 
            continue;
          } else {
            throw new Error('请求过于频繁，请稍后再试。');
          }
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        const items = data?.results || [];
        
        // Preferred publishers boosting
        const preferredPublishers = ['acm', 'ieee', 'springer', 'elsevier', 'wiley', 'oxford', 'cambridge', 'nature', 'science', 'association for computing machinery'];
        
        let papers = items.map((item: any) => {
          const publisher = item.primary_location?.source?.host_organization_name || item.primary_location?.source?.display_name || 'Unknown Publisher';
          const isPreferred = preferredPublishers.some(p => publisher.toLowerCase().includes(p));

          return {
            title: item.title || 'Unknown Title',
            authors: (item.authorships || []).map((a: any) => ({
              name: a.author?.display_name || 'Unknown'
            })),
            year: item.publication_year,
            citationCount: item.cited_by_count || 0,
            abstract: reconstructAbstract(item.abstract_inverted_index),
            externalIds: {
              DOI: item.doi ? item.doi.replace('https://doi.org/', '') : ''
            },
            url: item.doi || item.primary_location?.landing_page_url || '',
            publisher: publisher,
            // Extensions for Phase 2: Relational mapping
            openalexId: item.id,
            relatedWorks: item.related_works || [],
            referencedWorks: item.referenced_works || [],
            _isPreferred: isPreferred
          };
        });
        
        // Boost preferred publishers slightly
        papers.sort((a, b) => {
          if (a._isPreferred && !b._isPreferred) return -1;
          if (!a._isPreferred && b._isPreferred) return 1;
          return 0; // maintain original relevance sort otherwise
        });
        
        // Take top 5 after sorting
        papers = papers.slice(0, 5).map(p => {
          delete p._isPreferred;
          return p;
        });
        
        // 2. Update Cache
        cache.set(cacheKey, {
          data: papers,
          timestamp: Date.now()
        });

        console.log(`[OpenAlex Search] Found ${papers.length} papers.`);
        return papers;
        
      } catch (e: any) {
        if (retries > 0 && e.message.includes('429')) {
           // handled above
        }
        console.error('[OpenAlex Search] Search failed:', e);
        if (retries === 0) {
          throw e;
        }
        retries--;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return [];
  }
}
