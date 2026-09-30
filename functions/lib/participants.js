"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.rebuildAllParticipants = exports.rebuildParticipant = exports.renameParticipant = void 0;
// @ts-nocheck
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
exports.renameParticipant = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "관리자 권한이 필요합니다.");
    const { participantId, newName, reason } = data;
    if (!participantId || !newName)
        throw new functions.https.HttpsError("invalid-argument", "participantId and newName required.");
    await db.runTransaction(async (transaction) => {
        const pRef = db.collection("participants").doc(participantId);
        const pSnap = await transaction.get(pRef);
        if (!pSnap.exists)
            throw new functions.https.HttpsError("not-found", "Participant not found");
        const pData = pSnap.data();
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
exports.rebuildParticipant = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "관리자 권한이 필요합니다.");
    const { participantId } = data;
    if (!participantId)
        throw new functions.https.HttpsError("invalid-argument", "participantId required.");
    // Because we use onWrite triggers, we can just trigger a dummy update to participants
    await db.collection("participants").doc(participantId).update({
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true };
});
const db = admin.firestore();
// rebuildAllParticipants
exports.rebuildAllParticipants = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "관리자 권한이 필요합니다.");
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
//# sourceMappingURL=participants.js.map