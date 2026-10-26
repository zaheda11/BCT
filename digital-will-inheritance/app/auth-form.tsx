"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [role,setRole]=useState("TESTATOR"); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const response=await fetch(`/api/auth/${mode}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email,password,role})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||"Could not sign in.");
      window.location.assign("/");
    } catch (e:unknown) { setError(e instanceof Error?e.message:"Request failed."); }
    finally { setBusy(false); }
  }
  return <main className="authshell"><form className="authcard" onSubmit={submit}><Link className="authbrand" href="/">LEGACY LEDGER</Link><span className="eyebrow">LOCAL DEVELOPMENT ACCOUNT</span><h1>{mode==="login"?"Welcome back":"Create your account"}</h1><p className="sub">Development prototype. Account registration does not verify legal identity.</p>
    {mode==="register"&&<label>Full name<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>}
    <label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label>Password<input type="password" autoComplete={mode==="login"?"current-password":"new-password"} required minLength={mode==="register"?12:1} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/>{mode==="register"&&<small>Use at least 12 characters.</small>}</label>
    {mode==="register"&&<label>Account role<select value={role} onChange={e=>setRole(e.target.value)}><option value="TESTATOR">Testator</option><option value="BENEFICIARY">Beneficiary</option></select><small>Verifier and administrator accounts are created by the local seed command.</small></label>}
    {error&&<div className="formerror" role="alert">{error}</div>}<button className="primary authsubmit" disabled={busy}>{busy?"Please wait…":mode==="login"?"Sign in":"Create account"}</button>
    <p className="authswitch">{mode==="login"?"New to the demo? ":"Already registered? "}<Link href={mode==="login"?"/register":"/login"}>{mode==="login"?"Create an account":"Sign in"}</Link></p><Link className="backlink" href="/">← Back to dashboard</Link>
  </form></main>
}
