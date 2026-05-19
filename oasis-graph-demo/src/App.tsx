import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Maximize, ZoomIn, ZoomOut, Target, Sparkles, Download, FileText, ChevronRight } from 'lucide-react';

// Mock Data
const gData = {
  nodes: [
    { id: 'core', title: 'Integrating Large Language Models with Multimodal Virtual Reality', shortKeywords: 'LLMs in VR', abstract: 'In the construction industry, where work environments are complex, unstructured and often dangerous, seamless human-robot collaboration is crucial. We propose a framework integrating spatial computing and LLMs.', group: 1, val: 30, year: 2024, journal: 'IEEE VR' },
    
    // Past References
    { id: 'ref1', title: 'A review of virtual reality in construction', shortKeywords: 'VR Construction', abstract: 'Virtual reality (VR) is gaining traction in AEC. This paper reviews 10 years of literature on safety training and spatial design validation.', group: 2, val: 12, year: 2018, journal: 'Automation in Construction' },
    { id: 'ref2', title: 'Human-robot collaboration in construction', shortKeywords: 'HRI Path Planning', abstract: 'We propose a framework for human-robot interaction emphasizing intent recognition and dynamic path planning in hazardous environments.', group: 2, val: 16, year: 2021, journal: 'Robotics and Autonomous Systems' },
    { id: 'ref3', title: 'Cognitive load in spatial interfaces', shortKeywords: 'Cognitive Load', abstract: 'Evaluating the cognitive overhead of 3D UI versus traditional 2D monitors.', group: 2, val: 10, year: 2020, journal: 'CHI Conference' },
    
    // Future/Concurrent Related
    { id: 'rel1', title: 'Spatial computing for HCI', shortKeywords: 'Spatial HCI', abstract: 'Spatial computing blurs the line between physical and digital. We explore the affordances of head-mounted displays in enterprise contexts.', group: 3, val: 14, year: 2023, journal: 'ACM TOCHI' },
    { id: 'rel2', title: 'LLMs as autonomous agents', shortKeywords: 'Autonomous Agents', abstract: 'Large language models have shown reasoning capabilities that allow them to act as autonomous agents in simulated environments.', group: 3, val: 20, year: 2024, journal: 'Nature Machine Intelligence' },
    { id: 'rel3', title: 'Multimodal interaction in VR', shortKeywords: 'Multimodal VR', abstract: 'Combining voice and gesture improves VR immersion and task efficiency significantly over traditional controller-based inputs.', group: 3, val: 15, year: 2022, journal: 'IEEE ISMAR' },
    { id: 'rel4', title: 'Generative AI for 3D asset creation', shortKeywords: 'GenAI 3D Assets', abstract: 'Using text-to-3D models to populate virtual environments dynamically.', group: 3, val: 12, year: 2024, journal: 'SIGGRAPH' }
  ],
  links: [
    // Core cites references (Core -> Refs)
    { source: 'core', target: 'ref1', type: 'references', strength: 2 },
    { source: 'core', target: 'ref2', type: 'references', strength: 3 },
    { source: 'core', target: 'ref3', type: 'references', strength: 1 },
    
    // Related cite core or are highly correlated (Related -> Core)
    { source: 'rel1', target: 'core', type: 'related', strength: 2 },
    { source: 'rel2', target: 'core', type: 'related', strength: 4 },
    { source: 'rel3', target: 'core', type: 'related', strength: 2 },
    { source: 'rel4', target: 'core', type: 'related', strength: 1 },
    
    // Inter-connections
    { source: 'ref2', target: 'ref1', type: 'references', strength: 1 },
    { source: 'rel2', target: 'rel1', type: 'related', strength: 2 }
  ]
};

export default function App() {
  const fgRef = useRef();
  const [hoverNode, setHoverNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [graphDimensions, setGraphDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef(null);

  // Filters State (Obsidian Controls)
  const [showPast, setShowPast] = useState(true);
  const [showFuture, setShowFuture] = useState(true);

  // Filter Data
  const filteredData = useMemo(() => {
    const nodes = gData.nodes.filter(n => {
      if (n.id === 'core') return true;
      if (n.group === 2 && !showPast) return false;
      if (n.group === 3 && !showFuture) return false;
      return true;
    });
    const nodeIds = new Set(nodes.map(n => n.id));
    const links = gData.links.filter(l => {
      const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
      const targetId = typeof l.target === 'object' ? l.target.id : l.target;
      return nodeIds.has(sourceId) && nodeIds.has(targetId);
    });
    return { nodes, links };
  }, [showPast, showFuture]);

  // Resize handler
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setGraphDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', updateDimensions);
    updateDimensions();
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Controls
  const handleZoomIn = () => fgRef.current?.zoom(fgRef.current.zoom() * 1.2, 400);
  const handleZoomOut = () => fgRef.current?.zoom(fgRef.current.zoom() / 1.2, 400);
  const handleFitView = () => fgRef.current?.zoomToFit(400, 50);
  const handleCenter = () => {
    if (selectedNode) {
      fgRef.current?.centerAt(selectedNode.x, selectedNode.y, 1000);
    } else {
      fgRef.current?.centerAt(0, 0, 1000);
    }
  };

  // Compute highlight elements
  const { highlightNodes, highlightLinks } = useMemo(() => {
    const nodes = new Set();
    const links = new Set();
    const targetNode = hoverNode || selectedNode;

    if (targetNode) {
      nodes.add(targetNode.id);
      filteredData.links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        
        if (sourceId === targetNode.id || targetId === targetNode.id) {
          links.add(link);
          nodes.add(sourceId);
          nodes.add(targetId);
        }
      });
    }
    return { highlightNodes: nodes, highlightLinks: links };
  }, [hoverNode, selectedNode, filteredData]);

  const paintNode = useCallback((node, ctx, globalScale) => {
    const isCore = node.id === 'core';
    const isHovered = node === hoverNode;
    const isSelected = node === selectedNode;
    const isHighlighted = highlightNodes.has(node.id);
    
    const hasTarget = hoverNode || selectedNode;
    
    // Determine basic opacity
    const opacity = hasTarget && !isHighlighted ? 0.05 : 1; 
    
    // REDUCE NODE SIZES (Obsidian uses relatively small nodes compared to screen space)
    const size = Math.sqrt(node.val) * 1.0; // Reduced from 1.5 to 1.0
    
    // Core color palette (Premium aesthetic)
    const colors = {
      core: { base: `rgba(236, 72, 153, ${opacity})`, glow: `rgba(236, 72, 153, ${opacity * 0.4})` },     
      ref: { base: `rgba(56, 189, 248, ${opacity})`, glow: `rgba(56, 189, 248, ${opacity * 0.4})` },      
      rel: { base: `rgba(167, 139, 250, ${opacity})`, glow: `rgba(167, 139, 250, ${opacity * 0.4})` }     
    };

    let theme = isCore ? colors.core : (node.group === 2 ? colors.ref : colors.rel);

    // Breathing Glow Effect based on Time
    const time = Date.now() / 1000;
    const breathOffset = isCore ? Math.sin(time * 2) * 0.5 + 0.5 : 0; // 0 to 1
    const dynamicGlowOpacity = isCore ? (opacity * 0.4 + breathOffset * 0.3) : (opacity * 0.6);
    const dynamicGlowColor = theme.glow.replace(/[\d.]+\)$/g, `${dynamicGlowOpacity})`);

    // Draw Node Glow
    if (isSelected || isHovered || (isCore && !hasTarget)) {
      ctx.beginPath();
      const glowRadius = Math.max(size * (2.5 + breathOffset * 0.5), 0.1); 
      ctx.arc(node.x, node.y, glowRadius, 0, 2 * Math.PI, false);
      try {
        const gradient = ctx.createRadialGradient(node.x, node.y, Math.max(size, 0.1), node.x, node.y, glowRadius);
        gradient.addColorStop(0, dynamicGlowColor);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fill();
      } catch (e) {
        ctx.fillStyle = dynamicGlowColor;
        ctx.fill();
      }
    }
    
    // Draw Node Core
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
    ctx.fillStyle = theme.base;
    ctx.fill();
    
    // Draw Label (PROGRESSIVE LOD: NO TEXT BY DEFAULT)
    // ONLY show text if: It is Highlighted by Spotlight OR User zoomed in EXTREMELY close
    const showLabel = isHighlighted || globalScale > 2.5;

    if (showLabel) {
      // Obsidian Pure Text Style (No background, single line, clean truncation)
      const isFocusedLabel = isHighlighted || isCore;
      
      // Use shortKeywords instead of full title for extreme cleanliness
      const label = node.shortKeywords || node.title;
      
      const fontSize = isFocusedLabel ? 11 / globalScale : 8 / globalScale;
      // Using Inter font to match Obsidian perfectly
      ctx.font = `${isFocusedLabel ? '500' : '400'} ${fontSize}px "Inter", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const yOffset = node.y + size + fontSize + 2 / globalScale;

      // Obsidian Style Text Stroke (Creates contrast against lines without bulky background)
      ctx.lineWidth = 3 / globalScale;
      ctx.strokeStyle = `rgba(11, 12, 16, ${opacity})`; // Match background
      ctx.strokeText(label, node.x, yOffset);
      
      // Text Fill
      ctx.fillStyle = `rgba(248, 250, 252, ${opacity})`;
      ctx.fillText(label, node.x, yOffset);
    }
  }, [hoverNode, selectedNode, highlightNodes]);

  const paintLink = useCallback((link, ctx, globalScale) => {
    const isHighlighted = highlightLinks.has(link);
    const hasTarget = hoverNode || selectedNode;
    
    // Link thickness based on semantic strength (e.g. citation count)
    let width = (link.strength || 1) / globalScale;
    
    // Gradient Logic
    const startColor = link.type === 'references' ? `rgba(236, 72, 153, 0.4)` : `rgba(167, 139, 250, 0.4)`; // Red/Purple
    const endColor = link.type === 'references' ? `rgba(56, 189, 248, 0.4)` : `rgba(236, 72, 153, 0.4)`;    // Blue/Red
    
    let opacityMultiplier = 1;
    if (isHighlighted) {
      width = ((link.strength || 1) * 2) / globalScale;
      opacityMultiplier = 2.5; // Brighter when highlighted
    } else if (hasTarget) {
      opacityMultiplier = 0.1; // Almost invisible if not in spotlight
    }

    // Create Gradient safely
    try {
      const gradient = ctx.createLinearGradient(
        link.source.x || 0, link.source.y || 0, 
        link.target.x || 0, link.target.y || 0
      );
      gradient.addColorStop(0, startColor.replace('0.4)', `${0.4 * opacityMultiplier})`));
      gradient.addColorStop(1, endColor.replace('0.4)', `${0.4 * opacityMultiplier})`));
      ctx.strokeStyle = gradient;
    } catch (e) {
      ctx.strokeStyle = startColor;
    }
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(link.source.x, link.source.y);
    
    // Draw line
    ctx.lineTo(link.target.x, link.target.y);
    ctx.stroke();

  }, [highlightLinks, hoverNode, selectedNode]);

  // Hover Popover Logic (Tooltip with Debounce & Grace Period)
  const handleNodeHover = useCallback((node) => {
    // 1. RESTORE ZERO LATENCY HIGHLIGHT: Instantly update canvas for fluid physical feedback
    setHoverNode(node);
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#0B0C10] overflow-hidden text-slate-200 font-sans selection:bg-pink-500/30 relative">
      
      {/* Left: Graph View (70%) */}
      <div ref={containerRef} className="w-[70%] h-full relative border-r border-white/5 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-slate-900/40 via-[#0B0C10] to-[#0B0C10]">
        
        {/* Top bar / Glassmorphism */}
        <div className="absolute top-6 left-6 z-10">
          <div className="backdrop-blur-md bg-white/5 border border-white/10 px-5 py-3 rounded-2xl flex items-center gap-3 shadow-2xl">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-purple-500 flex items-center justify-center shadow-lg shadow-pink-500/20">
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-100 tracking-wide leading-tight">
                OASIS <span className="text-slate-400 font-normal">Graph Explorer</span>
              </h2>
              <p className="text-[11px] text-slate-500">Mapping relationships via OpenAlex</p>
            </div>
          </div>
        </div>

        {/* The Graph */}
        <ForceGraph2D
          ref={fgRef}
          width={graphDimensions.width}
          height={graphDimensions.height}
          graphData={filteredData}
          nodeRelSize={6}
          nodeCanvasObject={paintNode}
          linkCanvasObjectMode={() => 'replace'}
          linkCanvasObject={paintLink}
          // Obsidian Directional Particles
          linkDirectionalParticles={link => (highlightLinks.has(link) || !hoverNode && !selectedNode) ? (link.strength || 1) + 1 : 0}
          linkDirectionalParticleWidth={1.5}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleColor={() => 'rgba(255,255,255,0.6)'}
          onNodeHover={handleNodeHover}
          onNodeClick={(node) => {
            setSelectedNode(node);
            // ONLY pan to the node smoothly, DO NOT zoom in automatically to avoid jarring UX
            fgRef.current.centerAt(node.x, node.y, 800);
          }}
          onBackgroundClick={() => setSelectedNode(null)}
          cooldownTicks={100}
          d3VelocityDecay={0.2}
          // Semantic Layout: Force references to left, related to right
          d3Force={(d3, graph) => {
            // MASSIVE REPULSION: Blow the universe apart to create Obsidian-like whitespace
            d3.force('charge').strength(-1500); 
            
            // LONG LINKS: Give nodes room to breathe
            d3.force('link').distance(link => 150 + (link.strength || 1) * 20); 
            
            // Explicit collision force to physically prevent nodes from overlapping
            d3.force('collide', d3.forceCollide(node => Math.sqrt(node.val) * 1.0 + 15)); 
            
            // X-Axis Directional Force (Weakened so it doesn't compress the graph too much)
            d3.force('x', d3.forceX(node => {
              if (node.id === 'core') return 0; 
              if (node.group === 2) return -300; // Pull past far left
              if (node.group === 3) return 300;  // Pull future far right
              return 0;
            }).strength(0.08));
            
            // Y-Axis gentle centering
            d3.force('y', d3.forceY(0).strength(0.02));
          }}
        />
        
        {/* Bottom Controls & Legend */}
        <div className="absolute bottom-6 left-6 flex gap-4 z-10">
          {/* Legend */}
          <div className="backdrop-blur-md bg-white/5 border border-white/10 p-4 rounded-2xl shadow-xl flex flex-col gap-3">
            <div className="flex items-center gap-3 text-xs font-medium text-slate-300">
              <div className="w-2.5 h-2.5 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.8)]"></div>
              <span>Core Paper</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium text-slate-300">
              <div className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]"></div>
              <span>Referenced (Past)</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium text-slate-300">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]"></div>
              <span>Related (Concurrent)</span>
            </div>
          </div>

          {/* View Controls & Graph Settings */}
          <div className="flex flex-col gap-2">
            <div className="backdrop-blur-md bg-white/5 border border-white/10 p-1.5 rounded-2xl shadow-xl flex flex-col gap-1">
              <button onClick={handleZoomIn} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white" title="Zoom In">
                <ZoomIn size={18} />
              </button>
              <button onClick={handleZoomOut} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white" title="Zoom Out">
                <ZoomOut size={18} />
              </button>
              <div className="h-[1px] bg-white/10 mx-2 my-1"></div>
              <button onClick={handleCenter} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white" title="Center Node">
                <Target size={18} />
              </button>
              <button onClick={handleFitView} className="p-2.5 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white" title="Fit to Screen">
                <Maximize size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right: AI Companion (30%) */}
      <div className="w-[30%] h-full bg-[#0D0E12] flex flex-col shadow-[-20px_0_40px_rgba(0,0,0,0.3)] z-20">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/5 bg-[#0B0C10]/50 backdrop-blur-xl flex justify-between items-center">
          <div className="flex items-center gap-2 text-pink-400">
            <Sparkles size={18} />
            <h3 className="text-sm font-semibold tracking-wide uppercase">AI Companion</h3>
          </div>
          {/* Obsidian Style Filters */}
          <div className="flex gap-2">
            <button 
              onClick={() => setShowPast(!showPast)}
              className={`text-[10px] px-2 py-1 rounded border transition-colors ${showPast ? 'bg-sky-500/10 text-sky-400 border-sky-500/30' : 'bg-white/5 text-slate-500 border-white/5'}`}
            >
              Past
            </button>
            <button 
              onClick={() => setShowFuture(!showFuture)}
              className={`text-[10px] px-2 py-1 rounded border transition-colors ${showFuture ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' : 'bg-white/5 text-slate-500 border-white/5'}`}
            >
              Future
            </button>
          </div>
        </div>
        
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
          {(!selectedNode && !hoverNode) ? (
            <div className="h-full flex flex-col justify-center items-center text-center space-y-4 animate-in fade-in duration-700">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2">
                <Target className="text-slate-500" size={24} />
              </div>
              <h4 className="text-lg font-medium text-slate-200">Select or hover a node</h4>
              <p className="text-sm text-slate-500 leading-relaxed max-w-[250px]">
                Explore the graph to view abstract summaries. Click a node to lock it for deep reading.
              </p>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
              
              {/* Paper Meta */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border ${
                      (selectedNode || hoverNode).id === 'core' ? 'bg-pink-500/10 text-pink-400 border-pink-500/20' :
                      (selectedNode || hoverNode).group === 2 ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' :
                      'bg-purple-500/10 text-purple-400 border-purple-500/20'
                    }`}>
                      {(selectedNode || hoverNode).id === 'core' ? 'Core Target' : (selectedNode || hoverNode).group === 2 ? 'Reference' : 'Related'}
                    </span>
                    <span className="text-xs text-slate-500">{(selectedNode || hoverNode).year} • {(selectedNode || hoverNode).val} Citations</span>
                  </div>
                  {!selectedNode && (
                    <span className="text-[10px] text-slate-500 bg-white/5 px-2 py-1 rounded animate-pulse">Previewing...</span>
                  )}
                </div>
                
                <h4 className="text-xl font-semibold text-slate-100 leading-snug mb-4">
                  {(selectedNode || hoverNode).title}
                </h4>
                
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 relative group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-white/20 to-transparent rounded-l-2xl"></div>
                  <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <FileText size={14} /> Abstract
                  </h5>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {(selectedNode || hoverNode).abstract}
                  </p>
                </div>
              </div>
              
              {/* AI Analysis Card (Only show if locked) */}
              {selectedNode && (
                <>
                  <div className="relative overflow-hidden rounded-2xl p-[1px] bg-gradient-to-b from-white/10 to-white/5">
                    <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 via-transparent to-purple-500/10 opacity-50"></div>
                    <div className="relative bg-[#0D0E12] p-5 rounded-2xl h-full">
                      <h5 className="text-xs font-semibold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Sparkles size={14} className="text-pink-400" /> AI Synthesis
                      </h5>
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {selectedNode.id === 'core' 
                          ? "This is the primary focal point of your search. It synthesizes LLM reasoning with VR modalities, serving as a bridge between spatial computing and autonomous AI agents."
                          : selectedNode.group === 2 
                            ? "As a foundational reference, this paper provides the theoretical scaffolding for Human-Robot interaction that the core paper subsequently applies to VR environments."
                            : "A highly relevant concurrent study. While it tackles similar interaction paradigms, it focuses more on the spatial mapping aspect rather than the LLM cognitive engine."
                        }
                      </p>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex flex-col gap-3 pt-2">
                    <button className="w-full group relative flex items-center justify-center gap-2 py-3.5 px-4 bg-white/5 hover:bg-white/10 border border-white/10 transition-all rounded-xl text-slate-200 font-medium text-sm overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-[100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                      <Download size={16} className="text-slate-400 group-hover:text-white transition-colors" />
                      Download PDF
                    </button>

                    {selectedNode.id !== 'core' && (
                      <button className="w-full group flex items-center justify-center gap-2 py-3.5 px-4 bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 transition-all rounded-xl text-pink-400 font-medium text-sm">
                        <Target size={16} />
                        Deep Dive: Set as New Core
                      </button>
                    )}
                  </div>
                </>
              )}
              
            </div>
          )}
        </div>
      </div>

      {/* Hover Popover Tooltip (Obsidian Style) */}
    </div>
  );
}
