"use client";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

export default function GetTokenPage() {
    const [token, setToken] = useState("Loading...");

    useEffect(() => {
        auth.currentUser?.getIdToken().then(setToken);
    }, []);

    return (
        <div style={{ padding: 20, wordBreak: "break-all" }}>
            <h2>Your test token (copy this):</h2>
            <p>{token}</p>
        </div>
    );
}