"use client";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

export default function TestEmployeeDetails() {
    const [result, setResult] = useState("Loading...");

    useEffect(() => {
        (async () => {
            const uid = auth.currentUser?.uid;
            if (!uid) {
                setResult("Not logged in — make sure you're logged into the app first.");
                return;
            }

            try {
                const empDoc = await getDoc(doc(db, "employees", uid));

                if (!empDoc.exists()) {
                    setResult("No employee document found for your uid: " + uid);
                    return;
                }

                const projectsSnap = await getDocs(
                    query(
                        collection(db, "projects"),
                        where("memberIds", "array-contains", uid),
                        where("status", "==", "active")
                    )
                );

                const currentProjects = projectsSnap.docs.map((d) => d.data().name);

                setResult(
                    JSON.stringify(
                        {
                            fullName: empDoc.data().fullName,
                            jobTitle: empDoc.data().jobTitle,
                            department: empDoc.data().department,
                            email: empDoc.data().email,
                            currentProjects,
                        },
                        null,
                        2
                    )
                );
            } catch (err: any) {
                setResult("Error: " + err.message);
            }
        })();
    }, []);

    return (
        <div style={{ padding: 20 }}>
            <h2>Test: getEmployeeDetails logic</h2>
            <pre style={{ background: "#111", color: "#0f0", padding: 16, borderRadius: 8 }}>
                {result}
            </pre>
        </div>
    );
}