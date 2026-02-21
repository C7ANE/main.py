import React, { useState, useEffect, useMemo } from 'react';
import { 
  Home, PlusCircle, BarChart2, Users, AlertTriangle, 
  CheckCircle, Activity, ChevronRight, Save, Trash2, Edit2, 
  X, UserPlus, Calendar, Clock, ArrowRight, ShieldAlert,
  Dumbbell, History as HistoryIcon, ChevronDown, ChevronUp,
  AlignLeft, Edit3, Check, Filter, Target, Medal, Pin,
  ArrowDownUp, BatteryWarning
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

// --- KONFIGURACJA FIREBASE ---
declare const __firebase_config: string;
declare const __app_id: string;
declare const __initial_auth_token: string;

const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    return JSON.parse(__firebase_config);
  }
  return {
    apiKey: "AIzaSyDFD50nJACwFKDwbLEG80BScOf4vE_IGcQ",
    authDomain: "ltad-tri-pop.firebaseapp.com",
    projectId: "ltad-tri-pop",
    storageBucket: "ltad-tri-pop.firebasestorage.app",
    messagingSenderId: "951889409223",
    appId: "1:951889409223:web:78343f51d78a2f5be53ae2",
    measurementId: "G-RKKV58HV2L"
  };
};

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- TYPY I INTERFEJSY ---
type Profile = 'PRO' | 'BASE';
type Discipline = 'PŁYWANIE' | 'ROWER' | 'BIEG' | 'FUNKCJONALNY' | 'PLIO/MOC';
type RecordCategory = 'SWIM' | 'BIKE' | 'RUN' | 'PLIO' | 'T1/T2';

interface Measurement {
  id: string;
  date: string;
  height: number;
  weight: number;
}

interface RecordItem {
  id: string;
  category: RecordCategory;
  label: string;
  value: string;
  isPinned: boolean;
}

interface Athlete {
  id: string;
  firstName: string;
  profile: Profile;
  age: number;
  joinDate: string;
  measurements: Measurement[]; 
  records: RecordItem[];
  focusPoints: string[]; 
}

interface SessionResult {
  athleteId: string;
  rpe: number;
  pain: number;
  load: number;
  isPresent: boolean;
  motivation?: number; 
}

interface Session {
  id: string;
  date: string; 
  discipline: Discipline;
  duration: number; 
  description?: string; 
  leadCoach?: string; 
  results: SessionResult[];
}

const MULTIPLIERS: Record<Discipline, number> = {
  'PŁYWANIE': 1.0,
  'ROWER': 1.0,
  'BIEG': 1.3,
  'FUNKCJONALNY': 1.1,
  'PLIO/MOC': 1.5,
};

const THEME = {
  bg: 'bg-slate-950',
  card: 'bg-slate-900',
  primary: '#E11D48',
  primaryClass: 'bg-[#E11D48] hover:bg-rose-700 text-white',
  border: 'border-slate-800',
  textMuted: 'text-slate-400'
};

// --- LOGIKA ANALITYCZNA ---
const calculateLoad = (duration: number, rpe: number, discipline: Discipline) => {
  return parseFloat((duration * rpe * MULTIPLIERS[discipline]).toFixed(2));
};

const getDaysDifference = (dateString1: string, dateString2: string) => {
  const d1 = new Date(dateString1).getTime();
  const d2 = new Date(dateString2).getTime();
  return Math.abs((d2 - d1) / (1000 * 3600 * 24));
};

const checkPHVAlert = (measurements: Measurement[]) => {
  if (!measurements || measurements.length < 2) return false;
  const sorted = [...measurements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latest = sorted[0];
  const previous = sorted[1];
  const days = getDaysDifference(latest.date, previous.date);
  if (days === 0) return false;
  const growth = latest.height - previous.height;
  if (growth <= 0) return false;
  const growthPerMonth = (growth / days) * 30;
  return growthPerMonth >= 0.8; 
};

const getAthleteMetrics = (athlete: Athlete, sessions: Session[]) => {
  const today = new Date().toISOString().split('T')[0];
  const daysInSystem = Math.max(1, Math.floor(getDaysDifference(today, athlete.joinDate)) + 1);
  const chronicDays = Math.min(28, daysInSystem);
  const acuteDays = Math.min(7, daysInSystem);
  
  let acuteLoadTotal = 0; 
  let chronicLoadTotal = 0; 
  let recentPain = 0;
  let recentMotivation = 8; 
  let attendedSessions = 0;
  let totalPlannedSessions = 0;
  let totalRpe = 0;
  let totalMotivation = 0;

  const athleteSessionsDesc = [...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  for (const s of athleteSessionsDesc) {
    const result = s.results.find(r => r.athleteId === athlete.id);
    if (result && result.isPresent) {
      recentPain = result.pain;
      recentMotivation = result.motivation || 8; 
      break;
    }
  }

  sessions.forEach(session => {
    totalPlannedSessions++;
    const daysAgo = getDaysDifference(today, session.date);
    const result = session.results.find(r => r.athleteId === athlete.id);
    if (result && result.isPresent) {
      attendedSessions++;
      totalRpe += result.rpe;
      totalMotivation += (result.motivation || 8); 
      if (daysAgo <= 28) chronicLoadTotal += result.load;
      if (daysAgo <= 7) acuteLoadTotal += result.load;
    }
  });

  const acuteAvg = acuteLoadTotal / acuteDays;
  const chronicAvg = chronicLoadTotal / chronicDays;
  const acwr = chronicAvg > 0 ? parseFloat((acuteAvg / chronicAvg).toFixed(2)) : 0;
  const attendance = totalPlannedSessions > 0 ? Math.round((attendedSessions / totalPlannedSessions) * 100) : 0;
  const avgRpe = attendedSessions > 0 ? parseFloat((totalRpe / attendedSessions).toFixed(1)) : 0;
  const avgMotivation = attendedSessions > 0 ? parseFloat((totalMotivation / attendedSessions).toFixed(1)) : 8;

  return { acwr, recentPain, recentMotivation, attendance, avgRpe, avgMotivation, phvAlert: checkPHVAlert(athlete.measurements) };
};

const getStatus = (acwr: number, recentPain: number) => {
  if (recentPain >= 4) return { color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/50', label: 'ALARM: Ból', IconComp: ShieldAlert };
  if (acwr >= 1.5) return { color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/50', label: 'ALARM: Przeciążenie', IconComp: AlertTriangle };
  if (acwr > 1.3) return { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/50', label: 'UWAGA: Wzrost obciążeń', IconComp: Activity };
  return { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/50', label: 'OPTYMALNIE', IconComp: CheckCircle };
};

// --- KOMPONENTY WIDOKÓW ---

const Dashboard = ({ athletes, sessions, setView, setSelectedAthlete }: any) => (
  <div className="space-y-6 animate-fade-in">
    <div className="flex justify-between items-center">
      <h2 className="text-2xl font-bold text-white">Pulpit Zespołu</h2>
      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 flex items-center">
        <Activity className="w-3 h-3 mr-1" /> LIVE SYNC
      </span>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {athletes.length === 0 && (
        <div className="col-span-full py-20 text-center border border-dashed border-slate-800 rounded-xl">
          <Users className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500">Brak zawodników w bazie danych.</p>
          <button onClick={() => setView('roster')} className="mt-4 text-[#E11D48] font-bold">Dodaj pierwszego zawodnika</button>
        </div>
      )}
      {athletes.map((athlete: Athlete) => {
        const m = getAthleteMetrics(athlete, sessions);
        const s = getStatus(m.acwr, m.recentPain);
        const DisplayIcon = m.phvAlert ? AlertTriangle : s.IconComp;

        return (
          <div key={athlete.id} onClick={() => { setSelectedAthlete(athlete.id); setView('analytics'); }} className={`${THEME.card} border ${m.phvAlert ? 'border-amber-500 shadow-lg shadow-amber-900/20' : s.border} rounded-xl p-5 cursor-pointer hover:scale-[1.02] transition-all`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">{athlete.firstName}</h3>
                <p className="text-xs text-slate-500 uppercase tracking-widest">{athlete.profile}</p>
              </div>
              <div className={`p-2 rounded-lg ${m.phvAlert ? 'bg-amber-500/20 text-amber-500' : s.bg + ' ' + s.color}`}>
                <DisplayIcon className={`w-5 h-5 ${m.phvAlert ? 'animate-pulse' : ''}`} />
              </div>
            </div>
            {m.phvAlert && <div className="mb-4 text-[10px] bg-amber-500/10 text-amber-200 p-2 rounded border border-amber-500/20 leading-tight">⚠️ PHV: Skok wzrostu! Ogranicz dynamikę.</div>}
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-[10px] text-slate-500 uppercase">ACWR</p><p className={`text-xl font-bold ${s.color}`}>{m.acwr}</p></div>
              <div><p className="text-[10px] text-slate-500 uppercase">Ból</p><p className={`text-xl font-bold ${m.recentPain >= 4 ? 'text-rose-500' : 'text-slate-200'}`}>{m.recentPain}/10</p></div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const NewTraining = ({ athletes, dbAddSession, setView }: any) => {
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [discipline, setDiscipline] = useState<Discipline>('PŁYWANIE');
  const [duration, setDuration] = useState(60);
  const [leadCoach, setLeadCoach] = useState('Kacper');
  const [results, setResults] = useState<Record<string, any>>({});

  useEffect(() => {
    if (step === 2) {
      const initial: any = {};
      athletes.forEach((a: any) => {
        initial[a.id] = { isPresent: true, rpe: 5, pain: 1, motivation: 8 };
      });
      setResults(initial);
    }
  }, [step, athletes]);

  const handleSave = async () => {
    const sessionResults = athletes.map((a: any) => ({
      athleteId: a.id,
      isPresent: results[a.id].isPresent,
      rpe: results[a.id].isPresent ? results[a.id].rpe : 0,
      pain: results[a.id].isPresent ? results[a.id].pain : 0,
      motivation: results[a.id].isPresent ? results[a.id].motivation : 0,
      load: results[a.id].isPresent ? calculateLoad(duration, results[a.id].rpe, discipline) : 0
    }));

    await dbAddSession({
      id: Date.now().toString(),
      date, discipline, duration, leadCoach, results: sessionResults
    });
    setView('dashboard');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-white">Rejestracja Treningu</h2>
      {step === 1 ? (
        <div className={`${THEME.card} p-6 rounded-xl border border-slate-800 space-y-4`}>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-slate-500 mb-1">Data</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">Czas (min)</label><input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white" /></div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-2">Dyscyplina</label>
            <div className="grid grid-cols-3 gap-2">
              {['PŁYWANIE', 'ROWER', 'BIEG', 'FUNKCJONALNY', 'PLIO/MOC'].map(d => (
                <button key={d} onClick={() => setDiscipline(d as any)} className={`py-2 rounded text-xs border ${discipline === d ? 'bg-[#E11D48] border-[#E11D48] text-white' : 'border-slate-800 text-slate-400'}`}>{d}</button>
              ))}
            </div>
          </div>
          <div><label className="block text-xs text-slate-500 mb-1">Trener</label><select value={leadCoach} onChange={e => setLeadCoach(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"><option>Kacper</option><option>Hubert</option><option>Piotr</option><option>Adrian</option></select></div>
          <button onClick={() => setStep(2)} className="w-full py-3 bg-[#E11D48] rounded-xl font-bold text-white">Przejdź do obecności</button>
        </div>
      ) : (
        <div className="space-y-4">
          {athletes.map((a: any) => (
            <div key={a.id} className={`${THEME.card} p-4 rounded-xl border border-slate-800 flex flex-col space-y-3`}>
              <div className="flex justify-between items-center">
                <span className="font-bold text-white">{a.firstName}</span>
                <button onClick={() => setResults({...results, [a.id]: {...results[a.id], isPresent: !results[a.id].isPresent}})} className={`px-3 py-1 rounded text-xs ${results[a.id].isPresent ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'}`}>{results[a.id].isPresent ? 'Obecny' : 'Nieobecny'}</button>
              </div>
              {results[a.id].isPresent && (
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="text-[10px] text-slate-500">RPE (1-10)</label><input type="number" value={results[a.id].rpe} onChange={e => setResults({...results, [a.id]: {...results[a.id], rpe: Number(e.target.value)}})} className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-white" /></div>
                  <div><label className="text-[10px] text-slate-500">Ból (0-10)</label><input type="number" value={results[a.id].pain} onChange={e => setResults({...results, [a.id]: {...results[a.id], pain: Number(e.target.value)}})} className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-white" /></div>
                  <div><label className="text-[10px] text-slate-500">Chęci (1-10)</label><input type="number" value={results[a.id].motivation} onChange={e => setResults({...results, [a.id]: {...results[a.id], motivation: Number(e.target.value)}})} className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-white" /></div>
                </div>
              )}
            </div>
          ))}
          <button onClick={handleSave} className="w-full py-4 bg-[#E11D48] rounded-xl font-bold text-white">Zapisz Trening w Chmurze</button>
        </div>
      )}
    </div>
  );
};

const Roster = ({ athletes, dbAddAthlete, dbDeleteAthlete }: any) => {
  const [name, setName] = useState('');
  const [profile, setProfile] = useState<Profile>('PRO');
  const [age, setAge] = useState(14);
  const [height, setHeight] = useState(170);

  const handleAdd = async () => {
    if (!name) return;
    await dbAddAthlete({
      id: Date.now().toString(),
      firstName: name, profile, age, joinDate: new Date().toISOString().split('T')[0],
      measurements: [{ id: 'init', date: new Date().toISOString().split('T')[0], height, weight: 60 }],
      records: [], focusPoints: []
    });
    setName('');
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Kadra Zespołu</h2>
      <div className={`${THEME.card} p-6 rounded-xl border border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-4 items-end`}>
        <div><label className="text-xs text-slate-500">Imię</label><input value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white" /></div>
        <div><label className="text-xs text-slate-500">Grupa</label><select value={profile} onChange={e => setProfile(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white"><option>PRO</option><option>BASE</option></select></div>
        <div><label className="text-xs text-slate-500">Wzrost (cm)</label><input type="number" value={height} onChange={e => setHeight(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white" /></div>
        <button onClick={handleAdd} className="bg-[#E11D48] py-2.5 rounded font-bold text-white">Dodaj</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {athletes.map((a: any) => (
          <div key={a.id} className={`${THEME.card} p-4 rounded-xl border border-slate-800 flex justify-between items-center`}>
            <div><span className="font-bold text-white">{a.firstName}</span><span className="ml-3 text-xs text-slate-500">{a.profile}</span></div>
            <button onClick={() => dbDeleteAthlete(a.id)} className="text-slate-600 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- GŁÓWNA APLIKACJA ---

export default function App() {
  const [view, setView] = useState<'dashboard' | 'new' | 'history' | 'analytics' | 'roster'>('dashboard');
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  const sanitizedAppId = useMemo(() => {
    const raw = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    return raw.split('/')[0];
  }, []);

  // 1. Autentykacja
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { console.error(e); }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. Synchronizacja Firestore
  useEffect(() => {
    if (!user) return;
    const athletesRef = collection(db, 'artifacts', sanitizedAppId, 'public', 'data', 'athletes');
    const sessionsRef = collection(db, 'artifacts', sanitizedAppId, 'public', 'data', 'sessions');

    const unsubAthletes = onSnapshot(athletesRef, (snap) => {
      setAthletes(snap.docs.map(d => d.data() as Athlete));
      setIsLoaded(true);
    }, (err) => console.error(err));

    const unsubSessions = onSnapshot(sessionsRef, (snap) => {
      setSessions(snap.docs.map(d => d.data() as Session));
    }, (err) => console.error(err));

    return () => { unsubAthletes(); unsubSessions(); };
  }, [user, sanitizedAppId]);

  const dbAddAthlete = async (a: Athlete) => {
    if (!user) return;
    await setDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'athletes', a.id), a);
  };

  const dbDeleteAthlete = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'athletes', id));
  };

  const dbAddSession = async (s: Session) => {
    if (!user) return;
    await setDoc(doc(db, 'artifacts', sanitizedAppId, 'public', 'data', 'sessions', s.id), s);
  };

  if (!isLoaded || !user) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white font-black animate-pulse">TRI POP PRO...</div>;
  }

  const navItems = [
    { id: 'dashboard', label: 'Pulpit', IconComp: Home },
    { id: 'new', label: 'Nowy Trening', IconComp: PlusCircle },
    { id: 'history', label: 'Historia', IconComp: HistoryIcon },
    { id: 'analytics', label: 'Analiza', IconComp: BarChart2 },
    { id: 'roster', label: 'Kadra', IconComp: Users }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20 md:pb-0 md:pl-64">
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 bg-slate-950 border-r border-slate-800 p-6">
        <h1 className="text-xl font-black text-white mb-8 tracking-tighter"><span className="text-[#E11D48]">TRI</span> POP PRO</h1>
        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.IconComp;
            return (
              <button key={item.id} onClick={() => setView(item.id as any)} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all ${view === item.id ? 'bg-[#E11D48] text-white' : 'text-slate-400 hover:bg-slate-900'}`}>
                <Icon className="w-5 h-5 mr-3" />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="p-4 md:p-8 max-w-7xl mx-auto">
        {view === 'dashboard' && <Dashboard athletes={athletes} sessions={sessions} setView={setView} setSelectedAthlete={setSelectedAthleteId} />}
        {view === 'new' && <NewTraining athletes={athletes} dbAddSession={dbAddSession} setView={setView} />}
        {view === 'roster' && <Roster athletes={athletes} dbAddAthlete={dbAddAthlete} dbDeleteAthlete={dbDeleteAthlete} />}
        {(view === 'history' || view === 'analytics') && (
           <div className="text-center py-20 text-slate-500 border border-dashed border-slate-800 rounded-2xl">
              <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Moduł {view === 'history' ? 'Historii' : 'Analizy'} wkrótce...</p>
              <button onClick={() => setView('dashboard')} className="mt-4 text-[#E11D48] underline">Wróć do pulpitu</button>
           </div>
        )}
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-slate-950/90 backdrop-blur-md border-t border-slate-800 flex justify-around p-2 z-50">
         {navItems.filter(i => ['dashboard', 'new', 'roster'].includes(i.id)).map(item => {
            const Icon = item.IconComp;
            return (
              <button key={item.id} onClick={() => setView(item.id as any)} className={`p-2 transition-colors ${view === item.id ? 'text-[#E11D48]' : 'text-slate-500'}`}><Icon /></button>
            );
         })}
      </nav>
    </div>
  );
}