"use client";

import { useCallback, useEffect, useState } from "react";
import { getQuestions, getRecords, replaceQuestions, replaceRecords } from "./storage";
import { subscribeQuestions, subscribeRecords } from "./firestore";
import { Question, RecordItem } from "./types";

export function useLiveRecords() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const refetch = useCallback(() => setRecords(getRecords()), []);

  useEffect(() => {
    setRecords(getRecords());
    return subscribeRecords((items) => {
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
      replaceQuestions(items);
      setQuestions(items);
    });
  }, []);

  return { data: questions, refetch };
}