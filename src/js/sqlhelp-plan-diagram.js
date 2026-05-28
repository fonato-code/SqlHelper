(function (global) {
  'use strict';
  var SqlHelp = global.SqlHelp = global.SqlHelp || {};

  const NODE_W = 200;
  const NODE_H = 88;
  const H_GAP = 64;
  const V_GAP = 18;
  const PADDING = 24;

  function rowCountForEdge(childNode) {
    const a = childNode.actualRows;
    const e = childNode.estimateRows;
    if (a != null && Number.isFinite(a)) return Math.max(1, a);
    if (e != null && Number.isFinite(e)) return Math.max(1, e);
    return 1;
  }

  function edgeStrokeWidth(rowCount) {
    const r = Math.max(1, Number(rowCount) || 1);
    if (r >= 100000) return 8;
    if (r >= 10000) return 6;
    if (r >= 1000) return 5;
    if (r >= 100) return 4;
    if (r >= 10) return 3;
    return 2;
  }

  /** Child (right) → Parent (left); arrowhead at parent */
  function buildEdgePath(from, to) {
    const x1 = from.x;
    const y1 = from.y + from.h / 2;
    const x2 = to.x + to.w;
    const y2 = to.y + to.h / 2;
    const midX = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  }

  /**
   * @returns {number} center Y of this node
   */
  function layoutNode(node, depth, nextY, nodes, edges, parentId) {
    const id = node.nodeId || 'n' + nodes.length;
    const x = PADDING + depth * (NODE_W + H_GAP);

    if (!node.children || node.children.length === 0) {
      const y = nextY.value;
      nextY.value += NODE_H + V_GAP;
      nodes.push({ id, x, y, w: NODE_W, h: NODE_H, data: node });
      if (parentId != null) {
        edges.push({ fromId: id, toId: parentId, rowCount: rowCountForEdge(node) });
      }
      return y + NODE_H / 2;
    }

    const centers = [];
    for (const ch of node.children) {
      centers.push(layoutNode(ch, depth + 1, nextY, nodes, edges, id));
    }

    const minC = Math.min(...centers);
    const maxC = Math.max(...centers);
    const y = (minC + maxC) / 2 - NODE_H / 2;

    nodes.push({ id, x, y, w: NODE_W, h: NODE_H, data: node });
    if (parentId != null) {
      edges.push({ fromId: id, toId: parentId, rowCount: rowCountForEdge(node) });
    }
    return y + NODE_H / 2;
  }

  function layoutPlanDiagram(root) {
    if (!root) {
      return { nodes: [], edges: [], width: 400, height: 200, nodeMap: {} };
    }

    const nodes = [];
    const edges = [];
    const nextY = { value: PADDING };
    layoutNode(root, 0, nextY, nodes, edges, null);

    const edgeKeys = new Set();
    const uniqueEdges = [];
    for (const e of edges) {
      const key = e.fromId + '->' + e.toId;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      uniqueEdges.push(e);
    }

    let maxX = 0;
    let maxY = 0;
    const nodeMap = {};
    for (const n of nodes) {
      nodeMap[n.id] = n;
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }

    const layoutEdges = uniqueEdges
      .filter((e) => nodeMap[e.fromId] && nodeMap[e.toId])
      .map((e) => {
        const from = nodeMap[e.fromId];
        const to = nodeMap[e.toId];
        return {
          fromId: e.fromId,
          toId: e.toId,
          rowCount: e.rowCount,
          strokeWidth: edgeStrokeWidth(e.rowCount),
          path: buildEdgePath(from, to)
        };
      });

    return {
      nodes,
      edges: layoutEdges,
      width: maxX + PADDING,
      height: Math.max(maxY + PADDING, nextY.value),
      nodeMap
    };
  }

  function nodeVisualClass(node) {
    const c = [];
    if ((node.costPercent || 0) >= 30) c.push('plan-node-hot');
    else if ((node.costPercent || 0) >= 10) c.push('plan-node-warm');
    if (node.rowMismatch === 'high') c.push('plan-node-rows-bad');
    if (node.isScan && (node.tableCardinality || 0) > 500) c.push('plan-node-scan');
    if (node.warnings && node.warnings.length) c.push('plan-node-warn');
    return c.join(' ');
  }

  SqlHelp.layoutPlanDiagram = layoutPlanDiagram;
  SqlHelp.planNodeVisualClass = nodeVisualClass;
  SqlHelp.PLAN_NODE_W = NODE_W;
  SqlHelp.PLAN_NODE_H = NODE_H;
})(typeof window !== 'undefined' ? window : this);
