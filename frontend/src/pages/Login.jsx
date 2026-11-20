import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Bus, ShieldCheck, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const { data, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (authError) {
            setError(authError.message);
            setLoading(false);
            return;
        }

        // Fetch user role from profiles table
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', data.user.id)
            .single();

        if (profileError || !profile) {
            setError('Profile not found. Make sure this user exists in the profiles table.');
            setLoading(false);
            return;
        }

        setLoading(false);
        navigate(profile.role === 'admin' ? '/admin' : '/parent');
    };

    // Quick-fill helper for fast Viva demonstrations
    const fillDemo = (demoEmail, demoPass) => {
        setEmail(demoEmail);
        setPassword(demoPass);
        setError('');
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8">
                <div className="flex flex-col items-center text-center mb-8">
                    <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mb-4">
                        <Bus className="w-8 h-8 text-amber-400" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">SafeRide School Transit</h1>
                    <p className="text-slate-400 text-sm mt-1">
                        Live Fleet Telemetry &amp; Child Safety Portal
                    </p>
                </div>

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase mb-1.5">
                            Email Address
                        </label>
                        <div className="relative">
                            <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@school.com"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-amber-500 transition"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-400 uppercase mb-1.5">
                            Password
                        </label>
                        <div className="relative">
                            <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-amber-500 transition"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60"
                    >
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                Sign In <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </form>

                {/* Viva Quick-Fill Demo Credentials */}
                <div className="mt-8 pt-6 border-t border-slate-800">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Quick-Fill Demo Accounts (RBAC Test)</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            type="button"
                            onClick={() => fillDemo('admin@school.com', 'admin123')}
                            className="text-xs bg-slate-800 hover:bg-slate-700 py-2 rounded-lg transition cursor-pointer"
                        >
                            Admin
                        </button>
                        <button
                            type="button"
                            onClick={() => fillDemo('parent1@gmail.com', 'parent123')}
                            className="text-xs bg-slate-800 hover:bg-slate-700 py-2 rounded-lg transition cursor-pointer"
                        >
                            Parent 1
                        </button>
                        <button
                            type="button"
                            onClick={() => fillDemo('parent2@gmail.com', 'parent123')}
                            className="text-xs bg-slate-800 hover:bg-slate-700 py-2 rounded-lg transition cursor-pointer"
                        >
                            Parent 2
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}