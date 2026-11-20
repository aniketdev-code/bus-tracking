import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { supabase, MEDIAMTX_URL } from '../supabaseClient';
import {
    Bus,
    Video,
    Users,
    Map as MapIcon,
    AlertTriangle,
    Gauge,
    LogOut,
    CheckCircle2,
    X,
    Phone,
    Radio,
} from 'lucide-react';

export default function AdminDashboard({ onLogout }) {
    const [buses, setBuses] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [students, setStudents] = useState([]);
    const [activeTab, setActiveTab] = useState('map'); // 'map' | 'cctv' | 'students'
    const [selectedBusId, setSelectedBusId] = useState(null);
    const [activeCamBus, setActiveCamBus] = useState(null);

    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef({});

    // 1. Initial Fetch + Supabase Realtime Subscriptions
    useEffect(() => {
        const fetchAll = async () => {
            const [busRes, alertRes, studentRes] = await Promise.all([
                supabase.from('buses').select('*').order('id'),
                supabase.from('alerts').select('*').eq('is_resolved', false).order('created_at', { ascending: false }),
                supabase.from('students').select('*').order('student_name'),
            ]);
            if (busRes.data) setBuses(busRes.data);
            if (alertRes.data) setAlerts(alertRes.data);
            if (studentRes.data) setStudents(studentRes.data);
        };

        fetchAll();

        // Realtime: Buses GPS updates
        const busChannel = supabase
            .channel('admin-buses')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'buses' }, (payload) => {
                if (payload.eventType === 'UPDATE') {
                    setBuses((prev) => prev.map((b) => (b.id === payload.new.id ? payload.new : b)));
                }
            })
            .subscribe();

        // Realtime: Live Overspeed & SOS Alerts
        const alertChannel = supabase
            .channel('admin-alerts')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (payload) => {
                if (payload.eventType === 'INSERT' && !payload.new.is_resolved) {
                    setAlerts((prev) => [payload.new, ...prev]);
                } else if (payload.eventType === 'UPDATE') {
                    setAlerts((prev) =>
                        payload.new.is_resolved
                            ? prev.filter((a) => a.id !== payload.new.id)
                            : prev.map((a) => (a.id === payload.new.id ? payload.new : a))
                    );
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(busChannel);
            supabase.removeChannel(alertChannel);
        };
    }, []);

    // 2. Initialize Leaflet Map when on 'map' tab
    useEffect(() => {
        if (activeTab !== 'map' || !mapContainerRef.current) return;

        if (!mapInstanceRef.current) {
            mapInstanceRef.current = L.map(mapContainerRef.current).setView([19.228, 72.975], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
            }).addTo(mapInstanceRef.current);
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
                markersRef.current = {};
            }
        };
    }, [activeTab]);

    // 3. Sync Bus Markers on Map whenever GPS updates arrive
    useEffect(() => {
        if (activeTab !== 'map' || !mapInstanceRef.current) return;

        buses.forEach((bus) => {
            const isAlert = bus.status === 'alert' || bus.speed > 55;
            const badgeColor = isAlert ? '#ef4444' : '#f59e0b';

            const icon = L.divIcon({
                className: 'custom-bus-marker',
                html: `
          <div style="
            background:${badgeColor};
            color:#0f172a;
            font-weight:700;
            font-size:11px;
            padding:4px 8px;
            border-radius:9999px;
            border:2px solid #ffffff;
            box-shadow:0 4px 12px rgba(0,0,0,0.4);
            white-space:nowrap;
            display:inline-flex;
            align-items:center;
            gap:4px;
          ">
            🚌 ${bus.id} · ${bus.speed} km/h
          </div>
        `,
                iconSize: [110, 28],
                iconAnchor: [55, 14],
            });

            if (markersRef.current[bus.id]) {
                markersRef.current[bus.id].setLatLng([bus.lat, bus.lng]);
                markersRef.current[bus.id].setIcon(icon);
            } else {
                const marker = L.marker([bus.lat, bus.lng], { icon })
                    .addTo(mapInstanceRef.current)
                    .bindPopup(
                        `<b>${bus.id} (${bus.vehicle_number})</b><br/>Route: ${bus.route_name}<br/>Driver: ${bus.driver_name}<br/>Speed: ${bus.speed} km/h`
                    );
                markersRef.current[bus.id] = marker;
            }
        });
    }, [buses, activeTab]);

    const focusBusOnMap = (bus) => {
        setSelectedBusId(bus.id);
        if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo([bus.lat, bus.lng], 15, { duration: 0.8 });
            markersRef.current[bus.id]?.openPopup();
        }
    };

    const resolveAlert = async (alertId) => {
        await supabase.from('alerts').update({ is_resolved: true }).eq('id', alertId);
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    };

    const reassignStudentBus = async (studentId, newBusId) => {
        const { error } = await supabase
            .from('students')
            .update({ bus_id: newBusId })
            .eq('id', studentId);

        if (!error) {
            setStudents((prev) =>
                prev.map((s) => (s.id === studentId ? { ...s, bus_id: newBusId } : s))
            );
        }
    };

    // KPI Calculations
    const activeCount = buses.filter((b) => b.status !== 'stopped').length;
    const avgSpeed = buses.length
        ? Math.round(buses.reduce((sum, b) => sum + (b.speed || 0), 0) / buses.length)
        : 0;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
            {/* Top Header */}
            <header className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center justify-center">
                        <Bus className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg leading-tight">SafeRide Admin Control Room</h1>
                        <p className="text-xs text-slate-400 flex items-center gap-1.5">
                            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                            Supabase Realtime Connected · 5-Bus Fleet
                        </p>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                        onClick={() => setActiveTab('map')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${activeTab === 'map' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        <MapIcon className="w-3.5 h-3.5" /> Live Map
                    </button>
                    <button
                        onClick={() => setActiveTab('cctv')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${activeTab === 'cctv' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        <Video className="w-3.5 h-3.5" /> CCTV Wall
                    </button>
                    <button
                        onClick={() => setActiveTab('students')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${activeTab === 'students' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        <Users className="w-3.5 h-3.5" /> Students &amp; Buses
                    </button>
                </div>

                <button
                    onClick={onLogout}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                    <LogOut className="w-3.5 h-3.5" /> Logout
                </button>
            </header>

            {/* KPI Bar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-6 py-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-400">Active Fleet</p>
                        <p className="text-2xl font-bold text-emerald-400">{activeCount} / {buses.length}</p>
                    </div>
                    <Bus className="w-8 h-8 text-emerald-500/30" />
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-400">Avg Fleet Speed</p>
                        <p className="text-2xl font-bold text-amber-400">{avgSpeed} km/h</p>
                    </div>
                    <Gauge className="w-8 h-8 text-amber-500/30" />
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-400">Active Alerts</p>
                        <p className={`text-2xl font-bold ${alerts.length > 0 ? 'text-red-400' : 'text-slate-200'}`}>
                            {alerts.length}
                        </p>
                    </div>
                    <AlertTriangle className={`w-8 h-8 ${alerts.length > 0 ? 'text-red-500 animate-pulse' : 'text-slate-700'}`} />
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-400">CCTV Feeds Ready</p>
                        <p className="text-2xl font-bold text-sky-400">{buses.length} / {buses.length}</p>
                    </div>
                    <Video className="w-8 h-8 text-sky-500/30" />
                </div>
            </div>

            {/* Live Alerts Banner */}
            {alerts.length > 0 && (
                <div className="px-6 pb-4 space-y-2">
                    {alerts.map((alert) => (
                        <div
                            key={alert.id}
                            className="bg-red-500/10 border border-red-500/40 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                        >
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 animate-bounce" />
                                <div>
                                    <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-red-500 text-white mr-2">
                                        {alert.alert_type}
                                    </span>
                                    <span className="text-sm font-medium text-red-100">{alert.message}</span>
                                    <span className="text-xs text-red-300/80 ml-2">
                                        ({new Date(alert.created_at).toLocaleTimeString('en-IN')})
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => resolveAlert(alert.id)}
                                className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-emerald-500/20 text-red-200 hover:text-emerald-300 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Mark Resolved
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* TAB 1: LIVE MAP + FLEET SIDEBAR */}
            {activeTab === 'map' && (
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 px-6 pb-6">
                    {/* Fleet List */}
                    <div className="lg:col-span-4 space-y-3 overflow-y-auto max-h-[68vh] pr-1">
                        {buses.map((bus) => {
                            const isAlert = bus.status === 'alert' || bus.speed > 55;
                            const isSelected = selectedBusId === bus.id;
                            return (
                                <div
                                    key={bus.id}
                                    onClick={() => focusBusOnMap(bus)}
                                    className={`p-4 rounded-xl border transition cursor-pointer ${isSelected
                                        ? 'bg-slate-800/90 border-amber-500'
                                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm">{bus.id}</span>
                                            <span className="text-xs text-slate-400">{bus.vehicle_number}</span>
                                        </div>
                                        <span
                                            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isAlert
                                                ? 'bg-red-500/20 text-red-400'
                                                : 'bg-emerald-500/15 text-emerald-400'
                                                }`}
                                        >
                                            {bus.speed} km/h
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-300 mb-2">{bus.route_name}</p>
                                    <div className="flex items-center justify-between text-xs text-slate-400">
                                        <span className="flex items-center gap-1">
                                            <Phone className="w-3 h-3" /> {bus.driver_name}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveCamBus(bus);
                                            }}
                                            className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/30 text-sky-400 font-medium flex items-center gap-1 transition cursor-pointer"
                                        >
                                            <Video className="w-3 h-3" /> Cabin Cam
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Interactive Leaflet Map */}
                    <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[500px] relative">
                        <div ref={mapContainerRef} className="w-full h-full min-h-[500px] z-0" />
                    </div>
                </div>
            )}

            {/* TAB 2: MULTI-CAM CCTV WALL */}
            {activeTab === 'cctv' && (
                <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {buses.map((bus) => (
                        <div key={bus.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                    <span className="font-semibold text-sm">{bus.id} Cabin Cam</span>
                                </div>
                                <span className="text-xs text-slate-400">{bus.vehicle_number}</span>
                            </div>
                            <div className="aspect-video bg-black">
                                <iframe
                                    src={`${MEDIAMTX_URL}/${bus.cam_path}`}
                                    title={`${bus.id} Live Stream`}
                                    className="w-full h-full border-0"
                                    allow="autoplay; fullscreen"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* TAB 3: LIVE STUDENT-TO-BUS REASSIGNMENT (RBAC DEMO) */}
            {activeTab === 'students' && (
                <div className="px-6 pb-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="p-4 border-b border-slate-800">
                            <h2 className="font-semibold">Student Bus Assignments</h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Changing a student&apos;s bus here immediately updates what their parent can view via Supabase Row Level Security.
                            </p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-950/60 text-xs uppercase text-slate-400">
                                    <tr>
                                        <th className="px-4 py-3">Student Name</th>
                                        <th className="px-4 py-3">Grade</th>
                                        <th className="px-4 py-3">Home Stop</th>
                                        <th className="px-4 py-3">Assigned Bus</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {students.map((student) => (
                                        <tr key={student.id} className="hover:bg-slate-800/40">
                                            <td className="px-4 py-3 font-medium">{student.student_name}</td>
                                            <td className="px-4 py-3 text-slate-400">{student.grade}</td>
                                            <td className="px-4 py-3 text-slate-300">{student.home_stop_name}</td>
                                            <td className="px-4 py-3">
                                                <select
                                                    value={student.bus_id || ''}
                                                    onChange={(e) => reassignStudentBus(student.id, e.target.value)}
                                                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-amber-500"
                                                >
                                                    {buses.map((b) => (
                                                        <option key={b.id} value={b.id}>
                                                            {b.id} — {b.route_name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Cabin Cam Modal */}
            {activeCamBus && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
                        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                                <h3 className="font-semibold text-sm">
                                    {activeCamBus.id} Live Cabin Cam ({activeCamBus.vehicle_number})
                                </h3>
                            </div>
                            <button
                                onClick={() => setActiveCamBus(null)}
                                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="aspect-video bg-black">
                            <iframe
                                src={`${MEDIAMTX_URL}/${activeCamBus.cam_path}`}
                                title="Live Cabin Cam"
                                className="w-full h-full border-0"
                                allow="autoplay; fullscreen"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}