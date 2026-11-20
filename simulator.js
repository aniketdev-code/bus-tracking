require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

// Initialize Supabase with the Secret Key (bypasses RLS for backend simulation)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// 5 Thane School Bus Routes (looping waypoints)
const fleet = [
    {
        id: 'BUS-01',
        route: [
            [19.2218, 72.9763], [19.2245, 72.9768], [19.2270, 72.9772],
            [19.2295, 72.9775], [19.2270, 72.9772], [19.2245, 72.9768]
        ],
        step: 0,
        status: 'active',
        baseSpeed: 34
    },
    {
        id: 'BUS-02',
        route: [
            [19.2590, 72.9680], [19.2615, 72.9677], [19.2640, 72.9673],
            [19.2660, 72.9670], [19.2640, 72.9673], [19.2615, 72.9677]
        ],
        step: 0,
        status: 'active',
        baseSpeed: 28
    },
    {
        id: 'BUS-03',
        route: [
            [19.2240, 72.9610], [19.2255, 72.9635], [19.2270, 72.9660],
            [19.2255, 72.9635]
        ],
        step: 0,
        status: 'active',
        baseSpeed: 25
    },
    {
        id: 'BUS-04',
        route: [
            [19.2330, 72.9890], [19.2355, 72.9870], [19.2380, 72.9850],
            [19.2355, 72.9870]
        ],
        step: 0,
        status: 'active',
        baseSpeed: 38
    },
    {
        id: 'BUS-05',
        route: [
            [19.2100, 72.9780], [19.2130, 72.9795], [19.2160, 72.9810],
            [19.2130, 72.9795]
        ],
        step: 0,
        status: 'active',
        baseSpeed: 30
    }
];

async function updateFleet() {
    for (const bus of fleet) {
        bus.step = (bus.step + 1) % bus.route.length;
        const [lat, lng] = bus.route[bus.step];

        // Add slight realistic speed fluctuation (+/- 4 km/h)
        const speed = bus.status === 'stopped'
            ? 0
            : Math.max(10, bus.baseSpeed + Math.floor(Math.random() * 9 - 4));

        const { error } = await supabase
            .from('buses')
            .update({
                lat,
                lng,
                speed,
                status: bus.status,
                updated_at: new Date().toISOString()
            })
            .eq('id', bus.id);

        if (error) {
            console.error(`❌ Error updating ${bus.id}:`, error.message);
        }
    }
    console.log(`📡 [${new Date().toLocaleTimeString()}] Synced GPS for 5 buses to Supabase`);
}

// Viva Demo Keyboard Triggers
async function triggerAlert(type) {
    const bus = fleet[0]; // Targets BUS-01 for easy live demo
    if (type === 'overspeed') {
        bus.baseSpeed = 68;
        bus.status = 'alert';
        await supabase.from('alerts').insert({
            bus_id: bus.id,
            alert_type: 'overspeed',
            message: 'BUS-01 exceeded 60 km/h speed limit (68 km/h) near Manpada.'
        });
        console.log('🚨 TRIGGERED: Overspeeding alert on BUS-01!');
    } else if (type === 'sos') {
        bus.status = 'alert';
        await supabase.from('alerts').insert({
            bus_id: bus.id,
            alert_type: 'sos',
            message: 'EMERGENCY SOS button pressed by driver on BUS-01!'
        });
        console.log('🆘 TRIGGERED: Emergency SOS alert on BUS-01!');
    } else if (type === 'reset') {
        bus.baseSpeed = 34;
        bus.status = 'active';
        console.log('✅ RESET: BUS-01 returned to normal speed & active status.');
    }
}

// Listen for keypresses in terminal
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c' || str === 'q') process.exit();
    if (str === 'o') triggerAlert('overspeed');
    if (str === 's') triggerAlert('sos');
    if (str === 'r') triggerAlert('reset');
});

console.log('🚌 5-Bus Supabase GPS Simulator Started!');
console.log('👉 Viva Controls: [O] Overspeed Alert | [S] SOS Alert | [R] Reset BUS-01 | [Q] Quit\n');

updateFleet();
setInterval(updateFleet, 3000);