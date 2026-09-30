// @ts-nocheck
﻿import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

const db = admin.firestore();

export const renameParticipant = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "관리자 권한이 필요합니다.");
  
  const { participantId, newName, reason } = data;
  if (!participantId || !newName) throw new functions.https.HttpsError("invalid-argument", "participantId and newName required.");

  await db.runTransaction(async (transaction) => {
    const pRef = db.collection("participants").doc(participantId);
    const pSnap = await transaction.get(pRef);
    if (!pSnap.exists) throw new functions.https.HttpsError("not-found", "Participant not found");
    
    const pData = pSnap.data()!;
    const oldName = pData.displayName;
    
    transaction.update(pRef, {
      displayName: newName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const auditRef = db.collection("auditLogs").doc();
    transaction.set(auditRef, {
      operationId: `rename_${participantId}_${Date.now()}`,
      targetType: "participant",
      targetId: participantId,
      action: "participant.rename",
      actorUid: context.auth.uid,
      reason: reason || null,
      before: { displayName: oldName },
      after: { displayName: newName },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { success: true };
});

export const rebuildParticipant = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "관리자 권한이 필요합니다.");
  
  const { participantId } = data;
  if (!participantId) throw new functions.https.HttpsError("invalid-argument", "participantId required.");

  // Because we use onWrite triggers, we can just trigger a dummy update to participants
  await db.collection("participants").doc(participantId).update({
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true };
});
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

const db = admin.firestore();

// rebuildAllParticipants
export const rebuildAllParticipants = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "관리자 권한이 필요합니다.");

  // Dummy update to trigger onWrite for all participants
  const participantsSnap = await db.collection("participants").get();
  
  const batch = db.batch();
  let count = 0;
  
  participantsSnap.forEach(doc => {
    batch.update(doc.ref, {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    count++;
  });

  if (count > 0) {
    await batch.commit();
  }

  return { success: true, count };
});
