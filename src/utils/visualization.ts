import * as d3 from 'd3';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';

// Define interfaces for the data structures
interface Node extends d3.SimulationNodeDatum {
  address: string;
  amount: number;
  is_contract: boolean;
  is_exchange?: boolean;
  name?: string;
  percentage?: number;
  transaction_count?: number;
  transfer_X721_count?: number | null;
  transfer_count?: number;
  // D3 adds these properties during simulation
  x?: number;
  y?: number;
  index?: number;
}

interface Link {
  source: number;
  target: number;
  backward: number;
  forward: number;
}

interface TokenLink {
  address: string;
  decimals?: number;
  name: string;
  symbol: string;
  links: any[];
}

interface MapData {
  version: number;
  chain: string;
  token_address: string;
  dt_update: string;
  full_name: string;
  symbol: string;
  is_X721: boolean;
  metadata: {
    max_amount: number;
    min_amount: number;
  };
  nodes: Node[];
  links: Link[];
  token_links: TokenLink[];
}

// Interface for custom D3 links
interface D3Link extends d3.SimulationLinkDatum<Node> {
  source: Node;
  target: Node;
  value: number;
  strength?: number;
}
/**
 * Generates a bubble map visualization from map data
 * @param {MapData} mapData - The map data from Bubblemaps API
 * @param {number} width - The width of the image
 * @param {number} height - The height of the image
 * @returns {Promise<Buffer>} - PNG image buffer
 */
function generateBubbleMap(mapData: MapData, width: number = 1200, height: number = 800): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Create a virtual DOM for d3 to use
      const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
      const document = dom.window.document;
      
      // Extract nodes and links from map data
      let { nodes, links } = mapData;
      
      // Filter out exchange addresses
      const originalNodeIndexMap = new Map<string, number>();
      nodes.forEach((node, index) => {
        originalNodeIndexMap.set(node.address, index);
      });
      
      const filteredNodes = nodes.filter(node => !(node.name?.includes('Binance') || node.is_exchange));

      // Skip if there's not enough data after filtering
      if (!filteredNodes || filteredNodes.length === 0) {
        throw new Error('Insufficient data to generate bubble map');
      }
      
      // Create a map from original indices to new indices
      const newNodeIndices = new Map<number, number>();
      filteredNodes.forEach((node, newIndex) => {
        const originalIndex = originalNodeIndexMap.get(node.address);
        if (originalIndex !== undefined) {
          newNodeIndices.set(originalIndex, newIndex);
        }
      });
      
      // Filter links that reference exchanges
      const filteredLinks = links.filter(link => {
        const sourceExists = newNodeIndices.has(link.source);
        const targetExists = newNodeIndices.has(link.target);
        return sourceExists && targetExists;
      }).map(link => ({
        ...link,
        source: newNodeIndices.get(link.source) as number,
        target: newNodeIndices.get(link.target) as number
      }));
      
      // Use filtered data for visualization
      nodes = filteredNodes;
      links = filteredLinks;
      
      // Create SVG element with a dark background
      const svg = d3.select(document.body)
        .append('svg')
        .attr('xmlns', 'http://www.w3.org/2000/svg')
        .attr('width', width)
        .attr('height', height)
        .style('background', '#121212');
      
      // Add a gradient background for dark theme
      const defs = svg.append('defs');
      const gradient = defs.append('linearGradient')
        .attr('id', 'background-gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '100%');
        
      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#121212');
        
      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#1e1e2e');
      
      // Add background rectangle with gradient
      svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .attr('fill', 'url(#background-gradient)');
      
      // Generate a nice color palette based on the token name or address
      const seed = mapData.full_name || mapData.token_address || 'default';
      const baseHue = Math.abs(seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360);
      
      // Create node colors similar to reference image
      const getNodeColor = (node: Node, i: number): string => {
        // Primary nodes are purple, with gold and green highlight groups
        if (node.is_contract) {
          if (i % 8 === 0) return '#50cd89'; // Green for some contracts
          if (i % 7 === 0) return '#ffc700'; // Gold for some contracts
          return '#8b5cf6'; // Purple for most contracts
        } else {
          if (i % 9 === 0) return '#50cd89'; // Green for some wallets
          if (i % 6 === 0) return '#ffc700'; // Gold for some wallets
          return '#7e52de'; // Lighter purple for most wallets
        }
      };
      
      // Scale node sizes based on percentage or amount with improved scaling
      const sizeScale = d3.scalePow<number>()
        .exponent(0.7)
        .domain([0, d3.max(nodes, d => d.percentage || d.amount) || 1])
        .range([3, 45]);
        
      // Create a force simulation with better parameters for dark theme
      const simulation = d3.forceSimulation<Node>(nodes)
        .force('charge', d3.forceManyBody().strength(-120))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('x', d3.forceX(width / 2).strength(0.07))
        .force('y', d3.forceY(height / 2).strength(0.07))
        .force('collision', d3.forceCollide().radius(function(d) { 
          // Handle possible type mismatch
          const node = d as Node;
          return sizeScale(node.percentage || node.amount) + 8; // Reduced padding for closer nodes
        }))
        .stop();
      
      // If we have links, add them to the simulation
      if (links && links.length > 0) {
        // Convert links to D3 expected format
        const d3Links: D3Link[] = links.map(link => ({
          source: nodes[link.source],
          target: nodes[link.target],
          value: link.forward + link.backward,
          strength: Math.log1p(link.forward + link.backward) / 10
        }));
        
        simulation.force('link', d3.forceLink<Node, D3Link>(d3Links)
          .id(d => d.address)
          .distance(60)
          .strength(link => Math.min(0.9, link.strength || 0.2)));
      }
      
      // Run the simulation with more iterations for better layout
      for (let i = 0; i < 1000; ++i) simulation.tick();
      
      // Create a container for visualization elements
      const container = svg.append('g')
        .attr('class', 'container');
      
      // Optional: Add subtle grid pattern for visual reference (very subtle for dark theme)
      const gridSize = 60;
      const grid = container.append('g')
        .attr('class', 'grid');
        
      for (let x = 0; x < width; x += gridSize) {
        grid.append('line')
          .attr('x1', x)
          .attr('y1', 0)
          .attr('x2', x)
          .attr('y2', height)
          .attr('stroke', '#2a2a3a')
          .attr('stroke-width', 0.3);
      }
      
      for (let y = 0; y < height; y += gridSize) {
        grid.append('line')
          .attr('x1', 0)
          .attr('y1', y)
          .attr('x2', width)
          .attr('y2', y)
          .attr('stroke', '#2a2a3a')
          .attr('stroke-width', 0.3);
      }
      
      // Create link group with improved styling for dark theme
      const linkGroup = container.append('g')
        .attr('class', 'links');
      
      // Draw links with varying thickness, opacity, and color based on value
      if (links && links.length > 0) {
        // Calculate the link values for scaling
        const linkValues = links.map(link => link.forward + link.backward);
        const linkScale = d3.scaleLog()
          .domain([d3.min(linkValues) || 1, d3.max(linkValues) || 100])
          .range([0.5, 2])
          .clamp(true);
        
        const linkOpacityScale = d3.scaleLog()
          .domain([d3.min(linkValues) || 1, d3.max(linkValues) || 100]) 
          .range([0.3, 0.8])
          .clamp(true);
          
        // Add arrow markers for link direction
        links.forEach((link, i) => {
          const source = nodes[link.source];
          const target = nodes[link.target];
          const value = link.forward + link.backward;
          
          if (source && target && source.x !== undefined && target.x !== undefined && 
              source.y !== undefined && target.y !== undefined) {
              
            // Determine link color based on source/target
            let linkColor = '#9076fc'; // Default purple
            
            if (getNodeColor(source, source.index || 0).includes('#ffc700') || 
                getNodeColor(target, target.index || 0).includes('#ffc700')) {
              linkColor = '#ffc700'; // Gold for gold-connected nodes
            } else if (getNodeColor(source, source.index || 0).includes('#50cd89') || 
                       getNodeColor(target, target.index || 0).includes('#50cd89')) {
              linkColor = '#50cd89'; // Green for green-connected nodes
            }
            
            // Create arrow markers for this link
            if (link.forward > 0) {
              const forwardMarker = `arrow-forward-${i}`;
              defs.append('marker')
                .attr('id', forwardMarker)
                .attr('viewBox', '0 -5 10 10')
                .attr('refX', 8)
                .attr('refY', 0)
                .attr('markerWidth', 6)
                .attr('markerHeight', 6)
                .attr('orient', 'auto')
                .append('path')
                .attr('d', 'M0,-4L10,0L0,4')
                .attr('fill', linkColor);
                
              // Draw the forward link
              linkGroup.append('path')
                .attr('d', `M${source.x},${source.y}A${Math.sqrt((target.x - source.x) ** 2 + (target.y - source.y) ** 2) * 1.5},${Math.sqrt((target.x - source.x) ** 2 + (target.y - source.y) ** 2) * 1.5} 0 0,1 ${target.x},${target.y}`)
                .attr('fill', 'none')
                .attr('stroke', linkColor)
                .attr('stroke-width', linkScale(link.forward))
                .attr('stroke-opacity', linkOpacityScale(link.forward))
                .attr('marker-end', `url(#${forwardMarker})`);
            }
            
            // If there are backward transactions, add another path
            if (link.backward > 0) {
              const backwardMarker = `arrow-backward-${i}`;
              defs.append('marker')
                .attr('id', backwardMarker)
                .attr('viewBox', '0 -5 10 10')
                .attr('refX', 8)
                .attr('refY', 0)
                .attr('markerWidth', 6)
                .attr('markerHeight', 6)
                .attr('orient', 'auto')
                .append('path')
                .attr('d', 'M0,-4L10,0L0,4')
                .attr('fill', linkColor);
                
              // Draw the backward link
              linkGroup.append('path')
                .attr('d', `M${target.x},${target.y}A${Math.sqrt((target.x - source.x) ** 2 + (target.y - source.y) ** 2) * 1.5},${Math.sqrt((target.x - source.x) ** 2 + (target.y - source.y) ** 2) * 1.5} 0 0,1 ${source.x},${source.y}`)
                .attr('fill', 'none')
                .attr('stroke', linkColor)
                .attr('stroke-width', linkScale(link.backward))
                .attr('stroke-opacity', linkOpacityScale(link.backward))
                .attr('marker-end', `url(#${backwardMarker})`);
            }
          }
        });
      }
      
      // Create node group
      const nodeGroup = container.append('g')
        .attr('class', 'nodes');
      
      // Draw nodes with improved styling for dark theme
      nodes.forEach((node, i) => {
        if (node.x === undefined || node.y === undefined) return;
        
        const radius = sizeScale(node.percentage || node.amount);
        const color = getNodeColor(node, i);
        
        // Create node group
        const nodeElement = nodeGroup.append('g')
          .attr('transform', `translate(${node.x}, ${node.y})`);
        
        // Add a glow filter for nodes
        const glowId = `glow-${i}`;
        defs.append('filter')
          .attr('id', glowId)
          .attr('x', '-50%')
          .attr('y', '-50%')
          .attr('width', '200%')
          .attr('height', '200%')
          .html(`
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feFlood flood-color="${color}" flood-opacity="0.6" result="flood"/>
            <feComposite in="flood" in2="coloredBlur" operator="in" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          `);
        
        // Draw the circle with enhanced glow effect
        nodeElement.append('circle')
          .attr('r', radius)
          .attr('fill', color)
          .attr('stroke', d3.hsl(color).brighter(0.3).toString())
          .attr('stroke-width', 1.5)
          .attr('filter', `url(#${glowId})`);
        
        // Add a thin outline for definition
        nodeElement.append('circle')
          .attr('r', radius)
          .attr('fill', 'none')
          .attr('stroke', d3.hsl(color).brighter(0.7).toString())
          .attr('stroke-width', 0.8)
          .attr('stroke-opacity', 0.9);
        
        // Add address labels with better styling for large nodes
        if (radius > 10 && i < 30) {

          // If has name use it otherwise short wallet address
          if(node.name && node.name.toLowerCase().startsWith(node.address.slice(0,5))){
            node.name = node.address.substring(0, 8) + '...' + node.address.substring(node.address.length - 4);
          }
          const labelText = node.name || node.address.substring(0, 8) + '...' + node.address.substring(node.address.length - 4);
          
          // Add a background for better readability
          nodeElement.append('rect')
            .attr('x', -labelText.length * 3)
            .attr('y', radius + 4)
            .attr('width', labelText.length * 6)
            .attr('height', 16)
            .attr('rx', 8)
            .attr('ry', 8)
            .attr('fill', 'rgba(20, 20, 30, 0.8)')
            .attr('stroke', color)
            .attr('stroke-width', 0.5)
            .attr('stroke-opacity', 0.8);
          
          // Add text with better styling
          nodeElement.append('text')
            .attr('dy', radius + 16)
            .attr('text-anchor', 'middle')
            .attr('font-family', 'Arial, sans-serif')
            .attr('font-size', '10px')
            .attr('font-weight', 'normal')
            .attr('fill', 'white')
            .text(labelText);
            
          // Add percentage for top holders
          if (i < 30 && node.percentage) {
            // Add percentage background
            nodeElement.append('circle')
              .attr('r', radius * 0.7)
              .attr('fill', 'rgba(20, 20, 30, 0.7)')
              .attr('stroke', color)
              .attr('stroke-width', 1);
              
            nodeElement.append('text')
              .attr('dy', 4)
              .attr('text-anchor', 'middle')
              .attr('font-family', 'Arial, sans-serif')
              .attr('font-size', '11px')
              .attr('font-weight', 'bold')
              .attr('fill', 'white')
              .text(`${node.percentage.toFixed(1)}%`);
          }
        }
      });
      
      // Add title with better styling for dark theme
      svg.append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', width)
        .attr('height', 70)
        .attr('fill', 'rgba(18, 18, 24, 0.7)');
      
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', 30)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-size', '18px')
        .attr('font-weight', 'bold')
        .attr('fill', 'white')
        .text(`${mapData.full_name || mapData.token_address} (${mapData.symbol || 'Token'}) - ${mapData.chain.toUpperCase()}`);
      
      // Add subtitle with more information for dark theme
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', 55)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-size', '12px')
        .attr('fill', '#b0b0c0')
        .text(`Holder Distribution • Last updated: ${mapData.dt_update || 'Unknown'} • Top ${nodes.length} holders`);
      
      // Arrow marker for direction
      defs.append('marker')
        .attr('id', 'legend-arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L10,0L0,4')
        .attr('fill', '#9076fc');
      
      // Add watermark with better positioning for dark theme
      svg.append('text')
        .attr('x', width - 10)
        .attr('y', height - 10)
        .attr('text-anchor', 'end')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-size', '9px')
        .attr('font-style', 'italic')
        .attr('fill', '#6c757d')
        .text('Generated using Bubblemaps API');
      
      // Convert SVG to PNG
      const svgString = document.body.innerHTML;
      
      // Use sharp for SVG to PNG conversion with higher quality
      try {
        const svgBuffer = Buffer.from(svgString);
        sharp(svgBuffer, { density: 300 }) // Higher DPI for better quality
          .resize(width, height, {
            fit: 'contain',
            background: { r: 18, g: 18, b: 30, alpha: 1 }
          })
          .png({ quality: 100, compressionLevel: 6 })
          .toBuffer()
          .then(buffer => {
            resolve(buffer);
          })
          .catch(err => {
            console.error('SVG conversion error:', err);
            // Create a simple fallback image with text explaining the error
            const fallbackSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
              <rect width="100%" height="100%" fill="#121212"/>
              <text x="50%" y="50%" font-family="Arial" font-size="24px" text-anchor="middle" fill="white">
                Unable to generate bubble map visualization
              </text>
              <text x="50%" y="50%" dy="30px" font-family="Arial" font-size="16px" text-anchor="middle" fill="#b0b0c0">
                Error processing token data: ${mapData.token_address}
              </text>
            </svg>`;
            
            // Convert the fallback SVG with higher quality
            const fallbackBuffer = Buffer.from(fallbackSvg);
            sharp(fallbackBuffer, { density: 300 })
              .resize(width, height, { 
                fit: 'contain',
                background: { r: 18, g: 18, b: 30, alpha: 1 }
              })
              .png({ quality: 100 })
              .toBuffer()
              .then(buffer2 => {
                resolve(buffer2);
              })
              .catch(() => {
                reject(new Error(`Failed to generate visualization for token: ${mapData.token_address}`));
              });
          });
      } catch (error) {
        console.error('Error in SVG conversion:', error);
        reject(error);
      }
    } catch (error) {
      console.error('Error in bubble map generation:', error);
      reject(error);
    }
  });
}

export { generateBubbleMap }; 