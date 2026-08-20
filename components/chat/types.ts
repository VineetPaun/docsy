/**
 * Shapes the chat panel passes around.
 *
 * `Citation` is the contract with `/api/chat`: the route builds these from the
 * retrieved chunks and sends them ahead of the first token, so the source
 * header can render while the answer is still being written.
 */

export interface Citation {
  id: number;
  documentId: string;
  documentName: string;
  content: string;
  startChar: number;
  endChar: number;
  pageNumber?: number;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  sources?: string[];
  citations?: Citation[];
}
