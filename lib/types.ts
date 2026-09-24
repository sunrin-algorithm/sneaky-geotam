export type Result = "truth" | "lie" | "unknown";

export type Question = {
  id: string;
  content: string;
};

export type RecordItem = {
  id: string;
  number: string;
  nickname: string;
  question: string;
  answer: string;
  result: Result;
  createdAt: string;
  isPublic: boolean;
};