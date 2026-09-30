// @ts-nocheck
﻿import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

const db = admin.firestore();

// Helper to rebuild participant results
async function rebuildParticipantResult(transaction: admin.firestore.Transaction, participantId: string) {
  const pDoc = await transaction.get(db.collection("participants").doc(participantId));
  if (!pDoc.exists) return; // participant deleted?

  const logsQuery = db.collection("inspectionLogs")
    .where("participantId", "==", participantId)
    .where("status", "==", "active")
    .orderBy("sequence", "asc");
  
  const logsSnap = await transaction.get(logsQuery);
  const commonMap = new Map<string, any>();
  const customQuestions: any[] = [];
  
  logsSnap.docs.forEach(doc => {
    const log = doc.data();
    if (log.type === "common") {
      log.questions.forEach((q: any) => {
        commonMap.set(q.sourceQuestionId || q.id, q);
      });
    } else {
      log.questions.forEach((q: any) => customQuestions.push(q));
    }
  });

  const commonQuestions = Array.from(commonMap.values());
  const allQ = [...commonQuestions, ...customQuestions];
  let truthCount = 0;
  let lieCount = 0;
  let unknownCount = 0;

  allQ.forEach(q => {
    if (q.result === "truth") truthCount++;
    else if (q.result === "lie") lieCount++;
    else unknownCount++;
  });

  const resultRef = db.collection("participantResults").doc(participantId);
  transaction.set(resultRef, {
    participantId,
    displayName: pDoc.data()?.displayName,
    commonQuestions,
    customQuestions,
    totalQuestions: allQ.length,
    truthCount,
    lieCount,
    unknownCount,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

export const completeInspection = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "관리자 권한이 필요합니다.");
  
  const { operationId, participantId, participantName, type, questions } = data;
  
  return await db.runTransaction(async (transaction) => {
    // 1. Participant
    const pRef = db.collection("participants").doc(participantId);
    const pDoc = await transaction.get(pRef);
    if (!pDoc.exists) {
      transaction.set(pRef, {
        id: participantId,
        displayName: participantName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // 2. Log
    const logId = db.collection("inspectionLogs").doc().id;
    const logRef = db.collection("inspectionLogs").doc(logId);
    
    // Get sequence
    const logsSnap = await transaction.get(db.collection("inspectionLogs").where("participantId", "==", participantId));
    const sequence = logsSnap.size + 1;

    const logData = {
      id: logId,
      operationId,
      participantId,
      participantNameSnapshot: participantName,
      type,
      questions,
      sequence,
      status: "active",
      version: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    transaction.set(logRef, logData);

    // 3. Audit
    const auditRef = db.collection("auditLogs").doc();
    transaction.set(auditRef, {
      operationId,
      targetType: "inspection",
      targetId: logId,
      action: "inspection.create",
      actorUid: context.auth.uid,
      before: null,
      after: logData,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 4. Rebuild result
    // Note: To truly do this safely in a transaction with queries, it's tricky because queries in transactions must be done before writes.
    // However, since we just added one log, we can compute the result directly or just defer the rebuild.
    // We will do a separate rebuild step, or we can just update the participant result directly here since we know the new data.
    // Let's defer it to avoid transaction complexity with queries after writes.
    
    return { success: true, logId };
  });
});

export const retractInspection = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "관리자 권한이 필요합니다.");
  
  const { id, reason } = data;
  
  await db.runTransaction(async (transaction) => {
    const logRef = db.collection("inspectionLogs").doc(id);
    const logSnap = await transaction.get(logRef);
    if (!logSnap.exists) throw new functions.https.HttpsError("not-found", "Not found");
    const logData = logSnap.data()!;
    if (logData.status === "retracted") throw new functions.https.HttpsError("failed-precondition", "Already retracted");

    const newVersion = (logData.version || 1) + 1;
    transaction.update(logRef, {
      status: "retracted",
      version: newVersion,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const auditRef = db.collection("auditLogs").doc();
    transaction.set(auditRef, {
      operationId: `retract_${id}_${Date.now()}`,
      targetType: "inspection",
      targetId: id,
      action: "inspection.retract",
      actorUid: context.auth.uid,
      reason: reason || null,
      beforeVersion: logData.version,
      afterVersion: newVersion,
      before: logData,
      after: { ...logData, status: "retracted", version: newVersion },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { success: true };
});

export const restoreInspection = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "관리자 권한이 필요합니다.");
  
  const { id, reason } = data;
  
  await db.runTransaction(async (transaction) => {
    const logRef = db.collection("inspectionLogs").doc(id);
    const logSnap = await transaction.get(logRef);
    if (!logSnap.exists) throw new functions.https.HttpsError("not-found", "Not found");
    const logData = logSnap.data()!;
    if (logData.status === "active") throw new functions.https.HttpsError("failed-precondition", "Already active");

    const newVersion = (logData.version || 1) + 1;
    transaction.update(logRef, {
      status: "active",
      version: newVersion,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const auditRef = db.collection("auditLogs").doc();
    transaction.set(auditRef, {
      operationId: `restore_${id}_${Date.now()}`,
      targetType: "inspection",
      targetId: id,
      action: "inspection.restore",
      actorUid: context.auth.uid,
      reason: reason || null,
      beforeVersion: logData.version,
      afterVersion: newVersion,
      before: logData,
      after: { ...logData, status: "active", version: newVersion },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { success: true };
});

export const updateInspection = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "관리자 권한이 필요합니다.");
  
  const { id, patch, reason } = data;
  
  await db.runTransaction(async (transaction) => {
    const logRef = db.collection("inspectionLogs").doc(id);
    const logSnap = await transaction.get(logRef);
    if (!logSnap.exists) throw new functions.https.HttpsError("not-found", "Not found");
    const logData = logSnap.data()!;
    
    const newVersion = (logData.version || 1) + 1;
    const newData = { ...logData, ...patch, version: newVersion };
    
    transaction.update(logRef, {
      ...patch,
      version: newVersion,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const auditRef = db.collection("auditLogs").doc();
    transaction.set(auditRef, {
      operationId: `update_${id}_${Date.now()}`,
      targetType: "inspection",
      targetId: id,
      action: "inspection.update",
      actorUid: context.auth.uid,
      reason: reason || null,
      beforeVersion: logData.version,
      afterVersion: newVersion,
      before: logData,
      after: newData,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { success: true };
});

// Since rebuild logic is complex inside transactions, we use Firestore Triggers to automatically rebuild participantResult whenever an inspectionLog changes!
export const onInspectionLogChange = functions.firestore
  .document("inspectionLogs/{logId}")
  .onWrite(async (change, context) => {
    const data = change.after.exists ? change.after.data() : change.before.data();
    if (!data) return;
    const participantId = data.participantId;

    await db.runTransaction(async (transaction) => {
      await rebuildParticipantResult(transaction, participantId);
    });
  });

export const onParticipantChange = functions.firestore
  .document("participants/{participantId}")
  .onWrite(async (change, context) => {
    const participantId = context.params.participantId;
    // Just trigger a rebuild to update displayName if it changed
    await db.runTransaction(async (transaction) => {
      await rebuildParticipantResult(transaction, participantId);
    });
  });
