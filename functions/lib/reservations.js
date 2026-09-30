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
exports.restoreReservation = exports.processReservation = exports.createReservation = void 0;
// @ts-nocheck
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
exports.createReservation = functions.https.onCall(async (data, context) => {
    const { name, phone } = data;
    if (!name || typeof name !== "string" || name.length < 2) {
        throw new functions.https.HttpsError("invalid-argument", "이름이 유효하지 않습니다.");
    }
    if (!phone || typeof phone !== "string" || phone.length < 10) {
        throw new functions.https.HttpsError("invalid-argument", "전화번호가 유효하지 않습니다.");
    }
    // Generate an ID for the reservation
    const resId = db.collection("reservations").doc().id;
    return await db.runTransaction(async (transaction) => {
        const counterRef = db.collection("system").doc("reservationCounter");
        const counterDoc = await transaction.get(counterRef);
        let currentSequence = 1;
        if (counterDoc.exists) {
            currentSequence = (counterDoc.data()?.queueSequence || 0) + 1;
        }
        // Reservation document
        const reservationRef = db.collection("reservations").doc(resId);
        transaction.set(reservationRef, {
            id: resId,
            name,
            phone,
            status: "waiting",
            queueSequence: currentSequence,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        // Update counter
        transaction.set(counterRef, { queueSequence: currentSequence }, { merge: true });
        // Update public stats
        const statsRef = db.collection("publicQueueStats").doc("current");
        const statsDoc = await transaction.get(statsRef);
        let waitingCount = 1;
        if (statsDoc.exists) {
            waitingCount = (statsDoc.data()?.waitingCount || 0) + 1;
        }
        transaction.set(statsRef, {
            waitingCount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        // Audit log
        const auditRef = db.collection("auditLogs").doc();
        transaction.set(auditRef, {
            operationId: `res_${resId}`,
            targetType: "reservation",
            targetId: resId,
            action: "reservation.create",
            actorUid: "system",
            before: null,
            after: { id: resId, name, status: "waiting", queueSequence: currentSequence },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true, id: resId, queueSequence: currentSequence };
    });
});
exports.processReservation = functions.https.onCall(async (data, context) => {
    // Must be admin
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "관리자 권한이 필요합니다.");
    }
    // Verify admin status
    const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
    if (!adminDoc.exists) {
        throw new functions.https.HttpsError("permission-denied", "관리자가 아닙니다.");
    }
    const { id } = data;
    if (!id)
        throw new functions.https.HttpsError("invalid-argument", "ID is required.");
    return await db.runTransaction(async (transaction) => {
        const ref = db.collection("reservations").doc(id);
        const docSnap = await transaction.get(ref);
        if (!docSnap.exists) {
            throw new functions.https.HttpsError("not-found", "예약이 존재하지 않습니다.");
        }
        const resData = docSnap.data();
        if (resData.status !== "waiting") {
            throw new functions.https.HttpsError("failed-precondition", "이미 처리된 예약입니다.");
        }
        transaction.update(ref, {
            status: "completed",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        // Update public stats
        const statsRef = db.collection("publicQueueStats").doc("current");
        const statsDoc = await transaction.get(statsRef);
        if (statsDoc.exists) {
            const waitingCount = Math.max(0, (statsDoc.data()?.waitingCount || 1) - 1);
            transaction.update(statsRef, {
                waitingCount,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        // Audit log
        const auditRef = db.collection("auditLogs").doc();
        transaction.set(auditRef, {
            operationId: `process_${id}_${Date.now()}`,
            targetType: "reservation",
            targetId: id,
            action: "reservation.process",
            actorUid: context.auth.uid,
            before: resData,
            after: { ...resData, status: "completed" },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    });
});
exports.restoreReservation = functions.https.onCall(async (data, context) => {
    // Must be admin
    if (!context.auth)
        throw new functions.https.HttpsError("unauthenticated", "관리자 권한이 필요합니다.");
    const adminDoc = await db.collection("admins").doc(context.auth.uid).get();
    if (!adminDoc.exists)
        throw new functions.https.HttpsError("permission-denied", "관리자가 아닙니다.");
    const { id } = data;
    if (!id)
        throw new functions.https.HttpsError("invalid-argument", "ID is required.");
    return await db.runTransaction(async (transaction) => {
        const ref = db.collection("reservations").doc(id);
        const docSnap = await transaction.get(ref);
        if (!docSnap.exists)
            throw new functions.https.HttpsError("not-found", "예약이 존재하지 않습니다.");
        const resData = docSnap.data();
        if (resData.status !== "completed") {
            throw new functions.https.HttpsError("failed-precondition", "대기 중인 예약입니다.");
        }
        transaction.update(ref, {
            status: "waiting",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        // Update public stats
        const statsRef = db.collection("publicQueueStats").doc("current");
        const statsDoc = await transaction.get(statsRef);
        let waitingCount = 1;
        if (statsDoc.exists) {
            waitingCount = (statsDoc.data()?.waitingCount || 0) + 1;
        }
        transaction.set(statsRef, {
            waitingCount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        // Audit log
        const auditRef = db.collection("auditLogs").doc();
        transaction.set(auditRef, {
            operationId: `restore_${id}_${Date.now()}`,
            targetType: "reservation",
            targetId: id,
            action: "reservation.restore",
            actorUid: context.auth.uid,
            before: resData,
            after: { ...resData, status: "waiting" },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    });
});
//# sourceMappingURL=reservations.js.map