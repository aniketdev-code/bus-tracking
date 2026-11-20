import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { supabase, MEDIAMTX_URL } from '../supabaseClient';
import {
    Bus,
    Video,
    Phone,
    LogOut,
    MapPin,
    Clock,
    ShieldCheck,
    AlertTriangle,
    X,
    Timer,
    Navigation,
    Radio,
} from 'lucide-react';

// Haversine formula to calculate distance in km between two GPS points
function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export default function ParentApp({ onLogout }) {
    const [student, setStudent] = useState(null);
    const [bus, setBus] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Cabin Cam + 2-Minute Auto-Cutoff State
    const [showCam, setShowCam] = useState(false);
    const [camSecondsLeft, setCamSecondsLeft] = useState(120);

    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const busMarkerRef = useRef(null);
    const stopMarkerRef = useRef(null);

    // 1. Fetch assigned student, bus, and active alerts (RLS filters automatically)
    const loadData = async () => {
        const { data: studentData } = await supabase
            .from('students')
            .select('*')
            .limit(1)
            .single();

        if (studentData) {
            setStudent(studentData);
            if (studentData.bus_id) {
                const [busRes, alertRes] = await Promise.all([
                    supabase.from('buses').select('*').eq('id', studentData.bus_id).single(),
                    supabase
                        .from('alerts')
                        .select('*')
                        .eq('bus_id', studentData.bus_id)
                        .eq('is_resolved', false)
                        .order('created_at', { ascending: false }),
                ]);
                if (busRes.data) setBus(busRes.data);
                if (alertRes.data) setAlerts(alertRes.data);
            }
        }
        setLoading(false);
    };

    useEffect(() => {
        loadData();

        // Realtime: Bus GPS updates
        const busChannel = supabase
            .channel('parent-bus')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'buses' }, (payload) => {
                setBus((current) => (current && current.id === payload.new.id ? payload.new : current));
            })
            .subscribe();

        // Realtime: Live Alerts for child's bus
        const alertChannel = supabase
            .channel('parent-alerts')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (payload) => {
                if (payload.eventType === 'INSERT' && !payload.new.is_resolved) {
                    setAlerts((prev) => [payload.new, ...prev]);
                } else if (payload.eventType === 'UPDATE' && payload.new.is_resolved) {
                    setAlerts((prev) => prev.filter((a) => a.id !== payload.new.id));
                }
            })
            .subscribe();

        // Realtime: If Admin reassigns student to a different bus during Viva
        const studentChannel = supabase
            .channel('parent-student')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'students' }, () => {
                loadData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(busChannel);
            supabase.removeChannel(alertChannel);
            supabase.removeChannel(studentChannel);
        };
    }, []);

    // 2. Initialize Leaflet Map
    useEffect(() => {
        if (loading || !bus || !mapContainerRef.current) return;

        if (!mapInstanceRef.current) {
            mapInstanceRef.current = L.map(mapContainerRef.current).setView([bus.lat, bus.lng], 14);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap',
            }).addTo(mapInstanceRef.current);
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
                busMarkerRef.current = null;
                stopMarkerRef.current = null;
            }
        };
    }, [loading, bus?.id]);

    // 3. Update Bus & Home Stop Markers
    useEffect(() => {
        if (!mapInstanceRef.current || !bus || !student) return;

        const isAlert = bus.status === 'alert' || bus.speed > 55;
        const busIcon = L.divIcon({
            className: 'parent-bus-marker',
            html: `
        <div style="
          background:${isAlert ? '#ef4444' : '#10b981'};
          color:#0f172a;
          font-weight:700;
          font-size:11px;
          padding:4px 9px;
          border-radius:9999px;
          border:2px solid #ffffff;
          box-shadow:0 4px 12px rgba(0,0,0,0.4);
          white-space:nowrap;
        ">
          🚌 ${bus.id} · ${bus.speed} km/h
        </div>
      `,
            iconSize: [110, 28],
            iconAnchor: [55, 14],
        });

        if (busMarkerRef.current) {
            busMarkerRef.current.setLatLng([bus.lat, bus.lng]);
            busMarkerRef.current.setIcon(busIcon);
        } else {
            busMarkerRef.current = L.marker([bus.lat, bus.lng], { icon: busIcon }).addTo(
                mapInstanceRef.current
            );
        }

        if (!stopMarkerRef.current) {
            const stopIcon = L.divIcon({
                className: 'home-stop-marker',
                html: `
          <div style="
            background:#3b82f6;
            color:#ffffff;
            font-weight:700;
            font-size:10px;
            padding:3px 7px;
            border-radius:9999px;
            border:2px solid #ffffff;
            box-shadow:0 4px 10px rgba(0,0,0,0.35);
            white-space:nowrap;
          ">
            🏠 ${student.home_stop_name}
          </div>
        `,
                iconSize: [110, 24],
                iconAnchor: [55, 12],
            });
            stopMarkerRef.current = L.marker([student.home_stop_lat, student.home_stop_lng], {
                icon: stopIcon,
            }).addTo(mapInstanceRef.current);
        }

        mapInstanceRef.current.panTo([bus.lat, bus.lng], { animate: true });
    }, [bus, student]);

    // 4. 2-Minute (120s) Auto-Cutoff Timer for Cabin Cam
    useEffect(() => {
        if (!showCam) {
            setCamSecondsLeft(120);
            return;
        }

        const timer = setInterval(() => {
            setCamSecondsLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setShowCam(false);
                    return 120;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [showCam]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">
                Loading your child&apos;s bus...
            </div>
        );
    }

    if (!student || !bus) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center gap-4">
                <p className="text-slate-400">No bus assigned to your account yet.</p>
                <button onClick={onLogout} className="px-4 py-2 bg-slate-800 rounded-xl text-sm cursor-pointer">
                    Logout
                </button>
            </div>
        );
    }

    // Live Distance & ETA Calculation
    const distanceKm = getDistanceKm(bus.lat, bus.lng, student.home_stop_lat, student.home_stop_lng);
    const etaMins = Math.max(1, Math.round((distanceKm / Math.max(bus.speed, 15)) * 60));

    // Trip Progress Stepper Logic
    const tripStep = distanceKm < 0.15 ? 3 : distanceKm < 0.6 ? 2 : 1;
    const steps = ['Departed School', 'On Route', 'Approaching Stop', 'Arrived'];

    const formatTimer = (secs) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex justify-center">
            {/* Mobile-First Container */}
            <div className="w-full max-w-md bg-slate-950 flex flex-col min-h-screen border-x border-slate-900">
                {/* Top Bar */}
                <header className="px-4 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                            <Bus className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h1 className="font-bold text-sm leading-tight">{student.student_name}</h1>
                            <p className="text-[11px] text-slate-400 flex items-center gap-1">
                                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                                {student.grade} · {bus.id}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onLogout}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition cursor-pointer"
                        title="Logout"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </header>

                {/* Active Alert Banner */}
                {alerts.length > 0 && (
                    <div className="p-3 space-y-2">
                        {alerts.map((alert) => (
                            <div
                                key={alert.id}
                                className="bg-red-500/15 border border-red-500/40 rounded-xl p-3 flex items-start gap-2.5"
                            >
                                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5 animate-bounce" />
                                <div className="text-xs">
                                    <p className="font-bold text-red-300 uppercase">{alert.alert_type} Alert</p>
                                    <p className="text-red-100 mt-0.5">{alert.message}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Live Map */}
                <div className="relative h-72 w-full bg-slate-900 border-b border-slate-800">
                    <div ref={mapContainerRef} className="w-full h-full z-0" />
                    <div className="absolute bottom-3 left-3 z-[400] bg-slate-950/90 backdrop-blur border border-slate-800 px-3 py-1.5 rounded-full text-[11px] flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>RBAC Protected · Showing only {bus.id}</span>
                    </div>
                </div>

                {/* Main Content Cards */}
                <div className="p-4 space-y-4 flex-1">
                    {/* ETA & Distance Card */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
                            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                                <Clock className="w-3.5 h-3.5 text-emerald-400" /> Est. Arrival
                            </div>
                            <p className="text-2xl font-bold text-emerald-400">{etaMins} min</p>
                            <p className="text-[11px] text-slate-500 truncate">To {student.home_stop_name}</p>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
                            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                                <Navigation className="w-3.5 h-3.5 text-amber-400" /> Distance &amp; Speed
                            </div>
                            <p className="text-2xl font-bold text-amber-400">{distanceKm.toFixed(2)} km</p>
                            <p className="text-[11px] text-slate-500">Live: {bus.speed} km/h</p>
                        </div>
                    </div>

                    {/* Trip Progress Stepper */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                        <p className="text-xs font-semibold text-slate-300 mb-3">Trip Progress</p>
                        <div className="flex items-center justify-between relative">
                            <div className="absolute top-2.5 left-0 right-0 h-0.5 bg-slate-800 z-0" />
                            {steps.map((label, idx) => {
                                const done = idx <= tripStep;
                                return (
                                    <div key={label} className="relative z-10 flex flex-col items-center w-1/4 text-center">
                                        <div
                                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${done
                                                ? 'bg-emerald-500 border-emerald-400'
                                                : 'bg-slate-950 border-slate-700'
                                                }`}
                                        />
                                        <span
                                            className={`text-[10px] mt-1.5 leading-tight ${done ? 'text-emerald-300 font-medium' : 'text-slate-500'
                                                }`}
                                        >
                                            {label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Watch Cabin Cam Button */}
                    <button
                        onClick={() => setShowCam(true)}
                        className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-sky-500/15 transition cursor-pointer"
                    >
                        <Video className="w-5 h-5" /> Watch Live Cabin Cam
                    </button>

                    {/* Driver & Bus Info Card */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-400">Assigned Bus &amp; Driver</p>
                            <p className="font-bold text-sm mt-0.5">{bus.driver_name}</p>
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-amber-400" /> {bus.vehicle_number} · {bus.route_name}
                            </p>
                        </div>
                        <a
                            href={`tel:${bus.driver_phone}`}
                            className="w-11 h-11 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 flex items-center justify-center transition"
                            title="Call Driver"
                        >
                            <Phone className="w-5 h-5" />
                        </a>
                    </div>
                </div>
            </div>

            {/* Cabin Cam Modal with 2-Minute Auto-Cutoff */}
            {showCam && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
                        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                                <h3 className="font-semibold text-sm">{bus.id} Cabin Cam</h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                                    <Timer className="w-3 h-3" /> {formatTimer(camSecondsLeft)}
                                </span>
                                <button
                                    onClick={() => setShowCam(false)}
                                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="aspect-video bg-black">
                            <iframe
                                src={`${MEDIAMTX_URL}/${bus.cam_path}`}
                                title="Live Cabin Cam"
                                className="w-full h-full border-0"
                                allow="autoplay; fullscreen"
                            />
                        </div>
                        <div className="px-4 py-2.5 bg-slate-950 text-[11px] text-slate-400 text-center">
                            Auto-disconnects after 2 minutes to conserve 4G bus DVR bandwidth.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}