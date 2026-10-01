export type Result = "truth" | "lie" | "unknown";

// 기존 구형 질문 타입 호환 유지
export type Question = {
  id: string;
  content: string;
  order?: number;
};

// 기존 구형 레코드 타입 호환 유지
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

// 신규 데이터 모델
export type QuestionType = "common" | "custom";
export type Answer = "yes" | "no";
export type DetectionResult = "truth" | "lie" | "unknown";

export interface QuestionRecord {
  id: string;
  questionType: QuestionType;
  sourceQuestionId?: string;
  question: string;
  answer: Answer;
  result: DetectionResult;
  order: number;
  createdAt?: string;
}

// 검사 로그 (InspectionLog) 모델 (PROMPT.md 2.2)
export interface InspectionLog {
  id: string;
  operationId: string;
  participantId: string;
  participantName: string;
  participantGroupId?: string;
  type: QuestionType;
  questions: QuestionRecord[];
  createdAt: string;
  updatedAt: string;
  sequence: number;
  status: "active" | "retracted";
  version: number;
  number: string;
  isPublic: boolean;
}

// InspectionSession (InspectionLog와 상호 호환)
export interface InspectionSession extends InspectionLog {
  participantGroupId: string;
}

// 작업 감사 로그 (AuditLog) 모델 (PROMPT.md 2.3)
export type AuditTargetType = "inspection" | "question" | "reservation" | "participant";
export type AuditAction = "create" | "update" | "retract" | "restore";

export interface AuditLog {
  id: string;
  operationId: string;
  targetType: AuditTargetType;
  targetId: string;
  action: AuditAction;
  beforeVersion: number | null;
  afterVersion: number;
  changes: Record<string, unknown>;
  actorId: string | null;
  timestamp: string;
  reason?: string;
}

export interface CommonQuestion {
  id: string;
  content: string;
  order: number;
}

// 참가자별 통합 기록 모델 (PROMPT.md 4, 5)
export interface AggregatedParticipant {
  participantId: string;
  participantName: string;
  latestNumber: string;
  latestCreatedAt: string;
  isPublic: boolean;
  commonQuestions: QuestionRecord[]; // 중복 제거된 최신 공통 질문 (순서대로)
  customQuestions: QuestionRecord[]; // 시간순 누적된 자율 질문
  allQuestions: QuestionRecord[]; // 공통 질문 먼저, 자율 질문 나중에
  totalQuestions: number;
  truthCount: number;
  lieCount: number;
  unknownCount: number;
  sessionCount: number;
  sessionIds: string[];
}

// 예약 데이터 모델
export type ReservationStatus = "대기" | "호출" | "완료" | "취소";
export type ReservationSection = "자율" | "공통";

export interface Reservation {
  id: number;
  section: ReservationSection;
  name: string;
  studentId: string;
  phone: string;
  people: number;
  status: ReservationStatus;
  calledAt?: string;
  createdAt: string;
}

export interface ReservationConfig {
  isClosed: boolean;
  closedReason?: string;
  closedAt?: string;
}
