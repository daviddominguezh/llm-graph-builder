import type { ToolChoice, ToolSet } from 'ai';

import type { Edge, Node, Precondition } from './graph.js';

export enum SPECIAL_EDGE {
  AnswerBusinessQuestion = 'AnswerBusinessQuestion',
}

export enum SKILL {
  ReplyUserRequestForInfo = 'ReplyUserRequestForInfo',
}

export const SKILL_EDGES: Record<SKILL, SPECIAL_EDGE> = {
  [SKILL.ReplyUserRequestForInfo]: SPECIAL_EDGE.AnswerBusinessQuestion,
};

export const EDGE_SKILLS: Record<SPECIAL_EDGE, SKILL> = {
  [SPECIAL_EDGE.AnswerBusinessQuestion]: SKILL.ReplyUserRequestForInfo,
};

export const SKILL_DESCRIPTIONS: Record<SKILL, { type: string; value: string }> = {
  [SKILL.ReplyUserRequestForInfo]: {
    type: 'tool_call',
    value:
      'Route to the business information node to answer questions exclusively about: 1) payment methods, 2) return policies, 3) shipping coverage, 4) catalog requests (when user literally asks for "catalogo", not for browsing specific products), 5) When asking for explanation of what a shopping cart is or "carrito" concept, 6) When asking the sizing system, its equivalent in US sizes, and how the sizes work. (Not valid if asking about available sizes, only if the user wants to understand the measurement system in general), 7) Questions about what types or categories of products the business sells or does not sell (e.g., "¿venden relojes para mujer?", "¿tienen ropa de niños?", "¿manejan talla plus?"). These are business policy questions, NOT product search requests. The key distinction: if the user asks WHETHER the business sells a category, route here; if the user asks to SEE or FIND a specific product, route to search, 8) Questions about whether you are an AI or not',
  },
};

export const SKILL_PRECONDITION: Record<SKILL, Precondition> = {
  [SKILL.ReplyUserRequestForInfo]: {
    type: 'user_said',
    value:
      'Necesito informacion sobre los medios de pago, necesito saber sobre su politica de devoluciones, preguntas sobre las politicas del negocio, preguntas sobre qué tipo de productos vende o no vende el negocio (por ejemplo: ¿venden para hombre/mujer?, ¿tienen tal categoría?), o preguntas acerca de si eres una IA',
  },
};

export interface EdgeTools {
  tools?: ToolSet;
  toolChoice?: ToolChoice<NoInfer<ToolSet>>;
}

export type ToolsByEdge = Record<string, EdgeTools>;

export interface SMNextOptions {
  edges: Edge[];
  node: Node;
  prompt: string;
  promptWithoutToolPreconditions: string;
  toolsByEdge: ToolsByEdge;
  nextNode?: string;
  kind: 'tool_call' | 'agent_decision' | 'user_reply';
  nodes: Record<string, string>;
}

export interface SMPrompt {
  prompt: string;
  promptWithoutToolPreconditions: string;
  toolsByEdge: ToolsByEdge;
  node: Node;
  nextNode?: string;
  kind: 'tool_call' | 'agent_decision' | 'user_reply';
  nodes: Record<string, string>;
}

export interface UserNode {
  currentNode: string;
}
