"use client";

import { useCallback, useEffect, useState } from "react";
import { AuditLog, CommonQuestion, InspectionSession, Question, RecordItem, Reservation } from "./types";
import { inspectionRepo, questionRepo, reservationRepo } from "./storage";
import { getQuestions, getRecords, saveQuestions, replaceQuestions, replaceRecords } from "./storage";
import { subscribeQuestions, subscribeRecords } from "./firestore";

// ----------------------------------------------------
// 신규 훅: 검사 세션/로그 실시간 구독
// ----------------------------------------------------
export function useLiveInspections() {
  const [inspections, setInspections] = useState<InspectionSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    void inspectionRepo.getAll().then((data) => {
      setInspections(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = inspectionRepo.subscribe((data) => {
      setInspections(data);
      setLoading(false);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return { data: inspections, loading, refetch };
}

// ----------------------------------------------------
// 신규 훅: 작업 감사 로그(AuditLog) 실시간 구독
// ----------------------------------------------------
export function useLiveAuditLogs() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    void inspectionRepo.getAuditLogs().then((data) => {
      setAuditLogs(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = inspectionRepo.subscribeAuditLogs((data) => {
      setAuditLogs(data);
      setLoading(false);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return { data: auditLogs, loading, refetch };
}

// ----------------------------------------------------
// 신규 훅: 공통 질문 실시간 구독
// ----------------------------------------------------
export function useLiveCommonQuestions() {
  const [questions, setQuestions] = useState<CommonQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    void questionRepo.getAll().then((data) => {
      setQuestions(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = questionRepo.subscribe((data) => {
      setQuestions(data);
      setLoading(false);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return { data: questions, loading, refetch };
}

// ----------------------------------------------------
// 신규 훅: 예약 실시간 구독
// ----------------------------------------------------
export function useLiveReservations() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    void reservationRepo.getAll().then((data) => {
      setReservations(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = reservationRepo.subscribe((data) => {
      setReservations(data);
      setLoading(false);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return { data: reservations, loading, refetch };
}

// ----------------------------------------------------
// 기존 구형 훅 하위 호환
// ----------------------------------------------------
export function useLiveRecords() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const refetch = useCallback(() => setRecords(getRecords()), []);

  useEffect(() => {
    setRecords(getRecords());
    return subscribeRecords((items) => {
      if (!items.length) return;
      replaceRecords(items);
      setRecords(items);
    });
  }, []);

  return { data: records, refetch };
}

export function useLiveQuestions() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const refetch = useCallback(() => setQuestions(getQuestions()), []);

  useEffect(() => {
    setQuestions(getQuestions());
    return subscribeQuestions((items) => {
      if (!items.length) {
        const local = getQuestions();
        if (local.length) saveQuestions(local);
        return;
      }
      replaceQuestions(items);
      setQuestions(items);
    });
  }, []);

  return { data: questions, refetch };
}
