import { useState, useEffect, useMemo } from 'react';
import { 
  PlusCircle, BarChart2, Users, AlertTriangle, 
  CheckCircle, Activity, Trash2, ShieldAlert, History as HistoryIcon,
  ChevronRight, LayoutDashboard, Settings, UserPlus
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged
} from 'firebase/auth';
import type { User } from 'firebase/auth';

import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc
} from 'firebase/firestore';
import type {
  QuerySnapshot,
  DocumentData,
  QueryDocumentSnapshot
} from 'firebase/firestore';

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
  card: 'bg-slate-900/50 backdrop-blur-md border-slate-800/50',
  primary: '#E11D48',
  primaryClass: 'bg-[#E11D48] hover:bg-rose-700 text-white shadow-lg shadow-rose-500/20',
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
  if (recentPain >= 4) return { color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/30', label: 'ALARM: Ból', IconComp: ShieldAlert };
  if (acwr >= 1.5) return { color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/30', label: 'ALARM: Przeciążenie', IconComp: AlertTriangle };
  if (acwr > 1.3) return { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'UWAGA: Skok obciążeń', IconComp: Activity };
  return { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: 'OPTYMALNIE', IconComp: CheckCircle };
};

// --- KOMPONENTY WIDOKÓW ---

const Dashboard = ({ athletes, sessions, setView, setSelectedAthlete }: any) => (
  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h2 className="text-3xl font-black text-white tracking-tight">Pulpit Zespołu</h2>
        <p className="text-slate-400 text-sm">Monitorowanie w czasie rzeczywistym</p>
      </div>
      <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full px-4 py-1.5">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Live Cloud Sync</span>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {athletes.length === 0 && (
        <div className="col-span-full py-32 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/20">
          <div className="bg-slate-900 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-800 shadow-xl">
            <Users className="w-10 h-10 text-slate-700" />
          </div>
          <p className="text-slate-400 text-lg font-medium">Baza zawodników jest pusta</p>
          <button onClick={() => setView('roster')} className="mt-6 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-full text-white text-sm font-bold transition-all">Dodaj pierwszą osobę</button>
        </div>
      )}
      
      {athletes.map((athlete: Athlete) => {
        const m = getAthleteMetrics(athlete, sessions);
        const s = getStatus(m.acwr, m.recentPain);
        const DisplayIcon = m.phvAlert ? AlertTriangle : s.IconComp;

        return (
          <div 
            key={athlete.id} 
            onClick={() => { setSelectedAthlete(athlete.id); setView('analytics'); }} 
            className={`${THEME.card} border rounded-[2rem] p-6 cursor-pointer hover:border-rose-500/50 hover:bg-slate-900 transition-all duration-300 group relative overflow-hidden`}
          >
            {/* Dekoracja tła */}
            <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-5 blur-2xl ${m.phvAlert ? 'bg-amber-500' : 'bg-rose-500'}`}></div>

            <div className="flex justify-between items-start mb-6">
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-white group-hover:text-rose-400 transition-colors">{athlete.firstName}</h3>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-800 text-slate-300 uppercase tracking-tighter border border-slate-700">{athlete.profile}</span>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">{athlete.age} lat</span>
                </div>
              </div>
              <div className={`p-3 rounded-2xl ${m.phvAlert ? 'bg-amber-500/20 text-amber-500' : s.bg + ' ' + s.color}`}>
                <DisplayIcon className={`w-6 h-6 ${m.phvAlert ? 'animate-bounce' : ''}`} />
              </div>
            </div>

            {m.phvAlert && (
              <div className="mb-5 flex items-center gap-3 bg-amber-500/10 text-amber-200 p-3 rounded-2xl border border-amber-500/20 text-[11px] font-medium leading-tight">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>PHV Alert: Gwałtowny skok wzrostu. Zredukuj obciążenia dynamiczne.</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">ACWR</p>
                <div className="flex items-end gap-1">
                  <p className={`text-2xl font-black tracking-tighter ${s.color}`}>{m.acwr}</p>
                  <span className="text-[10px] text-slate-600 mb-1">ratio</span>
                </div>
              </div>
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Ból</p>
                <div className="flex items-end gap-1">
                  <p className={`text-2xl font-black tracking-tighter ${m.recentPain >= 4 ? 'text-rose-500' : 'text-slate-200'}`}>{m.recentPain}</p>
                  <span className="text-[10px] text-slate-600 mb-1">/10</span>
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-widest">
              <span>Szczegóły profilu</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
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
    <div className="max-w-3xl mx-auto space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="text-center">
        <h2 className="text-3xl font-black text-white">Rejestracja Treningu</h2>
        <p className="text-slate-400">Zbierz dane po zakończonej jednostce</p>
      </div>

      <div className="flex justify-center mb-8">
        <div className="flex items-center gap-4 bg-slate-900 p-2 rounded-full border border-slate-800">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${step === 1 ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-500'}`}>1</div>
          <div className="w-12 h-px bg-slate-800"></div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${step === 2 ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-500'}`}>2</div>
        </div>
      </div>

      {step === 1 ? (
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">Data Treningu</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white focus:outline-none focus:border-rose-500 transition-colors" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">Czas Trwania (min)</label>
              <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white focus:outline-none focus:border-rose-500 transition-colors" />
            </div>
          </div>
          
          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">Główna Dyscyplina</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {Object.keys(MULTIPLIERS).map(d => (
                <button 
                  key={d} 
                  onClick={() => setDiscipline(d as any)} 
                  className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-tighter border transition-all ${discipline === d ? 'bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-500/20' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">Trener Prowadzący</label>
            <select value={leadCoach} onChange={e => setLeadCoach(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white focus:outline-none focus:border-rose-500 transition-colors appearance-none">
              <option>Kacper</option><option>Hubert</option><option>Piotr</option><option>Adrian</option>
            </select>
          </div>

          <button onClick={() => setStep(2)} className="w-full py-5 bg-rose-500 hover:bg-rose-600 rounded-2xl font-black text-white uppercase tracking-widest shadow-xl shadow-rose-500/20 transition-all flex items-center justify-center gap-3">
            Dalej: Obecność i RPE <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {athletes.map((a: any) => (
            <div key={a.id} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4 shadow-xl">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-rose-500 border border-slate-700">{a.firstName[0]}</div>
                  <span className="font-bold text-white text-lg">{a.firstName}</span>
                </div>
                <button 
                  onClick={() => setResults({...results, [a.id]: {...results[a.id], isPresent: !results[a.id].isPresent}})} 
                  className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${results[a.id].isPresent ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}
                >
                  {results[a.id].isPresent ? 'Obecny' : 'Nieobecny'}
                </button>
              </div>
              
              {results[a.id].isPresent && (
                <div className="grid grid-cols-3 gap-3 animate-in fade-in zoom-in-95 duration-300">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase ml-1">RPE (1-10)</label>
                    <input type="number" min="1" max="10" value={results[a.id].rpe} onChange={e => setResults({...results, [a.id]: {...results[a.id], rpe: Number(e.target.value)}})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-center font-bold" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Ból (0-10)</label>
                    <input type="number" min="0" max="10" value={results[a.id].pain} onChange={e => setResults({...results, [a.id]: {...results[a.id], pain: Number(e.target.value)}})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-center font-bold" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Chęci (1-10)</label>
                    <input type="number" min="1" max="10" value={results[a.id].motivation} onChange={e => setResults({...results, [a.id]: {...results[a.id], motivation: Number(e.target.value)}})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-center font-bold" />
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="flex gap-4 mt-8">
            <button onClick={() => setStep(1)} className="flex-1 py-5 bg-slate-800 hover:bg-slate-700 rounded-2xl font-black text-white uppercase tracking-widest transition-all">Wstecz</button>
            <button onClick={handleSave} className="flex-[2] py-5 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-black text-white uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all">Zapisz sesję w chmurze</button>
          </div>
        </div>
      )}
    </div>
  );
};

const Roster = ({ athletes, dbAddAthlete, dbDeleteAthlete }: any) => {
  const [name, setName] = useState('');
  const [profile, setProfile] = useState<Profile>('PRO');
  const [height, setHeight] = useState(170);

  const handleAdd = async () => {
    if (!name) return;
    await dbAddAthlete({
      id: Date.now().toString(),
      firstName: name, profile, age: 14, joinDate: new Date().toISOString().split('T')[0],
      measurements: [{ id: 'init', date: new Date().toISOString().split('T')[0], height, weight: 60 }],
      records: [], focusPoints: []
    });
    setName('');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">Zarządzanie Kadrą</h2>
          <p className="text-slate-400">Dodawaj i edytuj profile zawodników</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 items-end">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">Imię zawodnika</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Wpisz imię..." className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white focus:outline-none focus:border-rose-500 transition-colors" />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">Grupa treningowa</label>
          <select value={profile} onChange={e => setProfile(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white focus:outline-none focus:border-rose-500 transition-colors appearance-none">
            <option>PRO</option><option>BASE</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-2">Aktualny wzrost (cm)</label>
          <input type="number" value={height} onChange={e => setHeight(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white focus:outline-none focus:border-rose-500 transition-colors" />
        </div>
        <button onClick={handleAdd} className="w-full py-4 bg-rose-500 hover:bg-rose-600 rounded-2xl font-black text-white uppercase tracking-widest shadow-xl shadow-rose-500/20 transition-all flex items-center justify-center gap-2">
          <UserPlus className="w-5 h-5" /> Dodaj
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {athletes.map((a: any) => (
          <div key={a.id} className="bg-slate-900/40 border border-slate-800 p-5 rounded-3xl flex justify-between items-center group hover:bg-slate-900 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center font-bold text-rose-500 border border-slate-700 transition-transform group-hover:scale-110">{a.firstName[0]}</div>
              <div>
                <p className="font-bold text-white text-lg leading-none mb-1">{a.firstName}</p>
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{a.profile} • {a.joinDate}</p>
              </div>
            </div>
            <button onClick={() => dbDeleteAthlete(a.id)} className="p-3 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all opacity-0 group-hover:opacity-100">
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- GŁÓWNA APLIKACJA ---

export default function App() {
  const [view, setView] = useState<'dashboard' | 'new' | 'history' | 'analytics' | 'roster'>('dashboard');
  const [user, setUser] = useState<User | null>(null);
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
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  // 2. Synchronizacja Firestore
  useEffect(() => {
    if (!user) return;
    const athletesRef = collection(db, 'artifacts', sanitizedAppId, 'public', 'data', 'athletes');
    const sessionsRef = collection(db, 'artifacts', sanitizedAppId, 'public', 'data', 'sessions');

    const unsubAthletes = onSnapshot(athletesRef, (snap: QuerySnapshot<DocumentData>) => {
      setAthletes(snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => d.data() as Athlete));
      setIsLoaded(true);
    }, (err: Error) => console.error(err));

    const unsubSessions = onSnapshot(sessionsRef, (snap: QuerySnapshot<DocumentData>) => {
      setSessions(snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => d.data() as Session));
    }, (err: Error) => console.error(err));

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
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center text-white font-black animate-pulse">
        <Activity className="w-16 h-16 text-[#E11D48] mb-6 animate-spin" />
        <h1 className="text-3xl tracking-tighter"><span className="text-[#E11D48]">TRI</span> POP PRO</h1>
        <p className="mt-4 text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em] opacity-50">LTAD Monitor System</p>
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Pulpit', IconComp: LayoutDashboard },
    { id: 'new', label: 'Dodaj Trening', IconComp: PlusCircle },
    { id: 'history', label: 'Baza Danych', IconComp: HistoryIcon },
    { id: 'analytics', label: 'Analiza ACWR', IconComp: BarChart2 },
    { id: 'roster', label: 'Zawodnicy', IconComp: Users }
  ];

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 pb-28 md:pb-0 md:pl-72 selection:bg-rose-500/30 selection:text-rose-200">
      
      {/* Dekoracyjne Światło w tle */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-rose-500/5 rounded-full blur-[120px] -z-10"></div>
      <div className="fixed bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] -z-10"></div>

      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-72 bg-slate-950/50 backdrop-blur-xl border-r border-slate-800/50 p-8 z-50">
        <div className="mb-12">
          <h1 className="text-3xl font-black text-white tracking-tighter flex items-center gap-2">
            <span className="w-8 h-8 bg-rose-500 rounded-lg flex items-center justify-center text-xs">TP</span>
            <span><span className="text-[#E11D48]">TRI</span> POP PRO</span>
          </h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2 ml-10">Klubowy Monitor Obciążeń</p>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map((item) => {
            const Icon = item.IconComp;
            return (
              <button 
                key={item.id} 
                onClick={() => setView(item.id as any)} 
                className={`w-full flex items-center px-5 py-4 rounded-2xl transition-all duration-300 group ${view === item.id ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}
              >
                <Icon className={`w-5 h-5 mr-4 transition-transform ${view === item.id ? 'scale-110' : 'group-hover:scale-110'}`} />
                <span className="font-bold text-sm">{item.label}</span>
                {view === item.id && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-8 border-t border-slate-800/50">
          <button className="w-full flex items-center px-5 py-4 rounded-2xl text-slate-500 hover:bg-slate-900 hover:text-white transition-all">
            <Settings className="w-5 h-5 mr-4" />
            <span className="font-bold text-sm">Ustawienia</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative p-6 md:p-12 max-w-7xl mx-auto min-h-screen">
        {view === 'dashboard' && <Dashboard athletes={athletes} sessions={sessions} setView={setView} setSelectedAthlete={() => {}} />}
        {view === 'new' && <NewTraining athletes={athletes} dbAddSession={dbAddSession} setView={setView} />}
        {view === 'roster' && <Roster athletes={athletes} dbAddAthlete={dbAddAthlete} dbDeleteAthlete={dbDeleteAthlete} />}
        
        {(view === 'history' || view === 'analytics') && (
           <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center mb-6 border border-slate-800 shadow-2xl">
                <Activity className="w-10 h-10 text-rose-500 animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Moduł w budowie</h3>
              <p className="text-slate-500 max-w-xs mx-auto">Pracujemy nad zaawansowanymi wykresami ACWR. Twoje dane są już zbierane w bezpiecznej bazie Firebase.</p>
              <button onClick={() => setView('dashboard')} className="mt-8 px-8 py-3 bg-slate-800 hover:bg-slate-700 rounded-full text-white font-bold transition-all">Wróć do Pulpitu</button>
           </div>
        )}
      </main>

      {/* Bottom Nav Mobile */}
      <nav className="md:hidden fixed bottom-6 inset-x-6 bg-slate-950/80 backdrop-blur-2xl border border-slate-800/50 flex justify-around p-4 rounded-[2rem] shadow-2xl z-50">
         {navItems.filter(i => ['dashboard', 'new', 'roster'].includes(i.id)).map(item => {
            const Icon = item.IconComp;
            return (
              <button 
                key={item.id}
                onClick={() => setView(item.id as any)} 
                className={`p-3 rounded-2xl transition-all ${view === item.id ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20 scale-110' : 'text-slate-500'}`}
              >
                <Icon className="w-6 h-6" />
              </button>
            );
         })}
      </nav>
    </div>
  );
}