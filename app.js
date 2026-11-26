import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, onSnapshot, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
    BASE_NUTRITION_DB,
    categoryLabels,
    locationLabels,
    recipeCategoryLabels,
    recipeTagLabels,
    supermarketOrder,
    pantryCategoryOrder,
    pantryLocationOrder,
    normalizeCategoryKey,
    getFreezeDurationDays,
    detectCategoryAndLocation
} from "./data.js";

if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const firebaseConfig = {
    apiKey: "AIzaSyA9buBCLmg_S9pypxnyoHu5NaYPhkJzLIo",
    authDomain: "vorratsschrank-d23ea.firebaseapp.com",
    projectId: "vorratsschrank-d23ea",
    storageBucket: "vorratsschrank-d23ea.firebasestorage.app",
    messagingSenderId: "691274363396",
    appId: "1:691274363396:web:dfd7e177f8c52c1799bb51"
};

const SECRET_HOUSEHOLD_ID = "Carsebama_200825";
const LOCAL_BARCODE_CACHE_KEY = "vorrat_barcode_memory_v1";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const vorratRef = collection(db, "haushalte", SECRET_HOUSEHOLD_ID, "vorrat");
const einkaufRef = collection(db, "haushalte", SECRET_HOUSEHOLD_ID, "einkaufsliste");
const rezepteRef = collection(db, "haushalte", SECRET_HOUSEHOLD_ID, "rezepte");
const statsRef = collection(db, "haushalte", SECRET_HOUSEHOLD_ID, "statistik");
const naehrwerteRef = collection(db, "haushalte", SECRET_HOUSEHOLD_ID, "naehrwerte");
const barcodesRef = collection(db, "haushalte", SECRET_HOUSEHOLD_ID, "barcodes");

let inventory = [];
let shoppingItems = [];
let recipes = [];
let yearlyStats = {};
let learnedNutritionDict = {};
let barcodeMemory = loadLocalBarcodeMemory();
let activeQuickFilter = 'ALL';
let activeRecipeFilter = 'ALL';
let activeRecipeTagFilter = '';
let userTouchedMhd = false;
let recipeServingsOverride = {};
let currentProposedPlan = [];
let wakeLockSentinel = null;

// --- OFFLINE-BARCODE-GEDÄCHTNIS ---
function loadLocalBarcodeMemory() {
    try {
        const raw = localStorage.getItem(LOCAL_BARCODE_CACHE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

function saveLocalBarcodeMemory() {
    try {
        localStorage.setItem(LOCAL_BARCODE_CACHE_KEY, JSON.stringify(barcodeMemory));
    } catch (e) {}
}

async function rememberBarcodeEntry(barcode, entryData) {
    if (!barcode) return;
    const cleanEntry = {
        name: entryData.name || '',
        amount: entryData.amount || 1,
        unit: entryData.unit || 'Stk.',
        category: normalizeCategoryKey(entryData.category),
        location: entryData.location || 'Vorratsschrank',
        minAmount: entryData.minAmount || null,
        nutrition: entryData.nutrition || null,
        updatedAt: new Date().toISOString()
    };
    barcodeMemory[barcode] = cleanEntry;
    saveLocalBarcodeMemory();
    try {
        await setDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "barcodes", barcode), cleanEntry, { merge: true });
    } catch (e) {
        console.warn("Barcode-Cloud-Sync folgt bei Verbindung:", e);
    }
}

// --- 3-STUFIGE NÄHRWERT-AUTOMATIK ---
function normalizeNutKey(name) {
    return (name || '').toLowerCase().trim().replace(/[.$/[\]#]/g, '_');
}

function lookupNutritionPer100g(ingredientName) {
    const lower = (ingredientName || '').toLowerCase().trim();
    if (!lower) return null;

    const pantryMatches = findMatchingPantryItems(lower);
    const withNutrition = pantryMatches.find(m => m.nutrition && typeof m.nutrition.kcal === 'number');
    if (withNutrition) {
        return { ...withNutrition.nutrition, pieceG: 100 };
    }

    for (const entry of BASE_NUTRITION_DB) {
        if (entry.keys.some(k => lower.includes(k))) {
            return entry;
        }
    }

    const safeKey = normalizeNutKey(lower);
    if (learnedNutritionDict[safeKey]) {
        return { ...learnedNutritionDict[safeKey], pieceG: 100 };
    }

    return null;
}

async function fetchAndLearnMissingNutrition(ingredients) {
    let learnedAny = false;

    for (const ing of ingredients) {
        const cleanName = (ing.name || '').trim();
        if (!cleanName || lookupNutritionPer100g(cleanName)) continue;

        try {
            const url = `https://de.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(cleanName)}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,nutriments`;
            const res = await fetch(url);
            const data = await res.json();

            if (data && Array.isArray(data.products) && data.products.length > 0) {
                const validSamples = data.products
                    .map(p => p.nutriments || {})
                    .filter(n => typeof n['energy-kcal_100g'] === 'number' && n['energy-kcal_100g'] >= 0 && n['energy-kcal_100g'] <= 900);

                if (validSamples.length > 0) {
                    const avg = (field) => {
                        const vals = validSamples.map(s => s[field]).filter(v => typeof v === 'number' && !isNaN(v));
                        if (vals.length === 0) return 0;
                        return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
                    };

                    const learnedEntry = {
                        name: cleanName,
                        kcal: Math.round(avg('energy-kcal_100g')),
                        p: avg('proteins_100g'),
                        c: avg('carbohydrates_100g'),
                        f: avg('fat_100g'),
                        sugar: avg('sugars_100g'),
                        salt: avg('salt_100g')
                    };

                    const safeKey = normalizeNutKey(cleanName);
                    learnedNutritionDict[safeKey] = learnedEntry;
                    learnedAny = true;

                    await setDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "naehrwerte", safeKey), learnedEntry);
                }
            }
        } catch (e) {
            console.warn("Online-Nährwertsuche übersprungen für:", cleanName);
        }
    }

    if (learnedAny) {
        renderRecipes();
    }
}

function estimateIngredientGrams(ing, nutEntry) {
    const amt = ing.amount || 0;
    if (amt <= 0) return 0;
    const u = ing.unit || 'Stk.';

    if (u === 'g' || u === 'ml') return amt;
    if (u === 'kg' || u === 'l') return amt * 1000;
    if (u === 'TL') return amt * 5;
    if (u === 'EL') return amt * 15;
    if (u === 'Prise') return amt * 0.5;
    if (u === 'Zehe') return amt * 4;
    if (u === 'Bund') return amt * 50;
    if (u === 'Dosen') return amt * 400;
    if (u === 'Stk.') return amt * (nutEntry && nutEntry.pieceG ? nutEntry.pieceG : 100);
    return amt * 100;
}

function calculateRecipeNutrition(rec, customServings = null) {
    const baseServings = rec.servings || 4;
    const targetServings = customServings || recipeServingsOverride[rec.id] || baseServings;
    const factor = targetServings / baseServings;

    let totalKcal = 0, totalP = 0, totalC = 0, totalF = 0, totalSugar = 0, totalSalt = 0;
    let matchedCount = 0;
    const ings = rec.ingredients || [];

    ings.forEach(ing => {
        const scaledIng = { ...ing, amount: ing.amount ? ing.amount * factor : 0 };
        const nut = lookupNutritionPer100g(ing.name);
        if (nut && scaledIng.amount > 0) {
            const grams = estimateIngredientGrams(scaledIng, nut);
            const mult = grams / 100;
            totalKcal += (nut.kcal || 0) * mult;
            totalP += (nut.p || 0) * mult;
            totalC += (nut.c || 0) * mult;
            totalF += (nut.f || 0) * mult;
            totalSugar += (nut.sugar || 0) * mult;
            totalSalt += (nut.salt || 0) * mult;
            matchedCount++;
        }
    });

    const perServing = {
        kcal: Math.round(totalKcal / targetServings),
        p: Math.round((totalP / targetServings) * 10) / 10,
        c: Math.round((totalC / targetServings) * 10) / 10,
        f: Math.round((totalF / targetServings) * 10) / 10,
        sugar: Math.round((totalSugar / targetServings) * 10) / 10,
        salt: Math.round((totalSalt / targetServings) * 100) / 100
    };

    return {
        hasData: matchedCount > 0,
        coverage: ings.length > 0 ? Math.round((matchedCount / ings.length) * 100) : 0,
        perServing,
        totalKcal: Math.round(totalKcal)
    };
}

// --- GESCHÄRFTE ANALYSE FÜR ALLE 13 AUTO-TAGS ---
function analyzeRecipeCharacteristics(rec) {
    const ings = rec.ingredients || [];
    const tags = rec.tags || [];
    const cat = rec.category || 'Hauptgericht';
    const titleLower = (rec.title || '').toLowerCase();
    const ingNamesLower = ings.map(i => (i.name || '').toLowerCase()).join(' ');
    const notesLower = (rec.notes || '').toLowerCase();
    const text = `${titleLower} ${ingNamesLower} ${notesLower}`;
    const nut = calculateRecipeNutrition(rec, rec.servings || 4);

    // 1. Backen
    const bakingKeywords = /\b(backpulver|trockenhefe|frische hefe|kuvertüre|kuchen|muffin|muffins|plätzchen|kekse|torte|bananenbrot|hefeteig|mürbeteig|rührteig|biskuit|streusel|stollen|lebkuchen|spekulatius|zimtsterne)\b/;
    const isBakingCat = ['KuchenGebaeck', 'PlaetzchenKleingebaeck', 'WeihnachtenAdvent'].includes(cat) && bakingKeywords.test(text);
    const isBaking = tags.includes('Backen') || bakingKeywords.test(text) || isBakingCat;

    // 2. Vegetarisch & 3. Vegan
    const nonVeggieRegex = /\b(fleisch|hackfleisch|rinderhack|schweinehack|gemischtes hack|hähnchen|hühnchen|pute|putenbrust|schnitzel|steak|bratwurst|würstchen|wiener|bockwurst|schinken|prosciutto|pancetta|speck|bacon|fisch|lachs|räucherlachs|thunfisch|garnelen|scampi|salami|chorizo|kotelett|gulasch|mett|leberwurst|gelatine|sardelle|sardellen|anchovis|hühnerbrühe|rinderbrühe|fleischbrühe|schmalz)\b/;
    const isVeggie = tags.includes('Vegetarisch') || tags.includes('Vegan') || !nonVeggieRegex.test(ingNamesLower);

    const nonVeganRegex = /\b(milch|vollmilch|kuhmilch|frischmilch|h-milch|buttermilch|kondensmilch|sahne|schlagsahne|kochsahne|saure sahne|schmand|crème fraîche|creme fraiche|frischkäse|quark|magerquark|speisequark|joghurt|naturjoghurt|skyr|mascarpone|ricotta|butter|kräuterbutter|mozzarella|parmesan|grana padano|gouda|emmentaler|cheddar|käse|reibekäse|feta|hirtenkäse|schafskäse|halloumi|ei|eier|eigelb|eiweiß|honig|nutella)\b/;
    const hasPlantMilkOnly = /\b(hafermilch|sojamilch|mandelmilch|reismilch|kokosmilch)\b/.test(ingNamesLower) && !/\b(vollmilch|kuhmilch|frischmilch|h-milch)\b/.test(ingNamesLower);
    const isVegan = tags.includes('Vegan') || (isVeggie && ings.length > 0 && (!nonVeganRegex.test(ingNamesLower) || hasPlantMilkOnly && !/\b(käse|butter|sahne|quark|joghurt|ei|eier|honig)\b/.test(ingNamesLower)));

    // 4. Kindgerecht
    const nonKidRegex = /\b(chili|chilischote|chiliflocken|jalapeño|tabasco|cayenne|pfefferoni|harissa|wasabi|alkohol|rotwein|weißwein|bier|rum|likör|amaretto|espresso|kaffee|matcha|räucherlachs|sushi|tatar|tiramisu|rohes ei)\b/;
    const heavySweetRegex = /\b(zucker|puderzucker|brauner zucker|rohrzucker|schokolade|kuvertüre|nutella|nougat|zuckerguss|karamell|sirup)\b/;
    const explicitBabyFriendly = /\b(baby|kleinkind|zuckerfrei|ohne zucker|blw)\b/.test(text);
    const isSweetDessertOrCake = isBaking || cat === 'DessertsSuessspeisen';
    const hasTooMuchSugar = !explicitBabyFriendly && ((nut.hasData && nut.perServing.sugar > 12) || (isSweetDessertOrCake && heavySweetRegex.test(ingNamesLower)));
    const hasTooMuchSalt = nut.hasData && nut.perServing.salt > 1.2;
    const isKidFriendly = tags.includes('Kindgerecht') || (!nonKidRegex.test(text) && !hasTooMuchSugar && !hasTooMuchSalt && cat !== 'GetraenkeSirup');

    // 5. Schnell
    const allTimeMatches = [...text.matchAll(/(\d+)\s*(?:min|minuten)/g)].map(m => parseInt(m[1], 10));
    const maxMinutes = allTimeMatches.length > 0 ? Math.max(...allTimeMatches) : null;
    const slowProcessRegex = /\b(schmoren|schmortopf|marinieren|ziehen lassen|über nacht|gehen lassen|ruhezeit|ruhen lassen|low\s*&\s*slow|stunden)\b/;
    const isSlowProcess = slowProcessRegex.test(text);
    const isQuick = tags.includes('Schnell') || (
        !isSlowProcess &&
        !isBaking &&
        (
            (maxMinutes !== null && maxMinutes <= 30) ||
            (maxMinutes === null && ings.length > 0 && ings.length <= 6 && !notesLower.includes('backofen'))
        )
    );

    // 6. Grillen / BBQ
    const grillRegex = /\b(grill|grillen|bbq|barbecue|grillrost|direkte hitze|indirekte hitze|dutch oven|räuchern|smoker)\b/;
    const isGrill = tags.includes('Grillen') || grillRegex.test(text);

    // 7. Einfrierbar
    const noFreezeRegex = /\b(blattsalat|feldsalat|rucola|eisbergsalat|kopfsalat|salatgurke)\b/;
    const mealPrepRegex = /\b(einfrieren|eintopf|suppe|lasagne|bolognese|curry|gulasch|chili con carne|chili sin carne|frikadellen|buletten)\b/;
    const isMealPrep = tags.includes('Einfrierbar') || (!noFreezeRegex.test(ingNamesLower) && (mealPrepRegex.test(text) || cat === 'SuppenEintoepfe'));

    // 8. One-Pot / Ofen
    const onePotPhraseRegex = /\b(one-pot|one pot|eintopf|pfannengericht|alles in einen topf|in einer pfanne|ofengemüse|blechgericht|vom blech|aufs backblech|auflauf|gratin|lasagne|ofenkartoffeln)\b/;
    const hasPot = /\b(topf|kochtopf|nudeltopf)\b/.test(notesLower);
    const hasPan = /\b(pfanne|bratpfanne)\b/.test(notesLower);
    const multiVesselPhrases = /\b(separat kochen|getrennt kochen|in einem zweiten|währenddessen in einer|parallel dazu)\b/;
    const isMultiVessel = (hasPot && hasPan) || multiVesselPhrases.test(notesLower);
    const isOnePot = tags.includes('One-Pot') || (!isBaking && !isMultiVessel && onePotPhraseRegex.test(text));

    // 9. Proteinreich
    const proteinCalShare = (nut.hasData && nut.perServing.kcal > 0) ? ((nut.perServing.p * 4) / nut.perServing.kcal) : 0;
    const isHighProtein = tags.includes('Proteinreich') || (nut.coverage >= 70 && (nut.perServing.p >= 25 || proteinCalShare >= 0.22));

    // 10. Leicht
    const heavyFatWords = /\b(frittieren|blätterteig|mascarpone|schlagsahne|mayonnaise)\b/;
    const isLight = tags.includes('Leicht') || (
        nut.coverage >= 75 &&
        !isBaking &&
        !heavyFatWords.test(ingNamesLower) &&
        nut.perServing.kcal > 0 &&
        nut.perServing.kcal <= 520 &&
        nut.perServing.f <= 22
    );

    // 11. Low-Carb
    const highCarbIngRegex = /\b(nudeln|spaghetti|penne|fusilli|tagliatelle|lasagne|reis|basmati|risotto|kartoffel|kartoffeln|süßkartoffel|mehl|weizenmehl|dinkelmehl|brot|toast|brötchen|gnocchi|spätzle|couscous|bulgur|haferflocken|zucker)\b/;
    const isLowCarb = tags.includes('Low-Carb') || (
        nut.coverage >= 75 &&
        !isBaking &&
        !highCarbIngRegex.test(ingNamesLower) &&
        nut.perServing.c <= 20
    );

    // 12. Festlich / Gäste
    const festiveRegex = /\b(festlich|gäste|weihnacht|ostern|braten|rinderfilet|schweinefilet|lachsfilet|lamm|ente|gans|risotto|tiramisu|panna cotta|rotwein|weißwein|prosecco|trüffel|spargel)\b/;
    const isFestive = tags.includes('Festlich') || festiveRegex.test(text) || cat === 'WeihnachtenAdvent';

    // 13. Resteverwertung
    const leftoverRegex = /\b(resteverwertung|reste|gemüsepfanne|bauernfrühstück|bratkartoffeln|auflauf|frittata|armerritter|arme ritter|brotpudding|suppe|eintopf)\b/;
    const isLeftover = tags.includes('Resteverwertung') || leftoverRegex.test(text);

    // Budget-Check für Wochenplan
    const isBudget = /\b(kartoffel|linsen|haferflocken|ei|eier|nudeln|reis|bohnen|möhre|karotte)\b/.test(ingNamesLower) && !/\b(lachs|steak|filet|garnelen|pinienkerne)\b/.test(ingNamesLower);

    return {
        isBaking,
        isVeggie,
        isVegan,
        isKidFriendly,
        isQuick,
        isGrill,
        isMealPrep,
        isOnePot,
        isHighProtein,
        isLight,
        isLowCarb,
        isFestive,
        isLeftover,
        isBudget,
        nut
    };
}

// --- SCREEN WAKE LOCK ---
const wakeLockBtn = document.getElementById('wakeLockBtn');
wakeLockBtn.addEventListener('click', async () => {
    if (!('wakeLock' in navigator)) {
        alert('Dein Browser unterstützt den Display-Wachhaltemodus leider nicht.');
        return;
    }
    if (wakeLockSentinel) {
        await wakeLockSentinel.release();
        wakeLockSentinel = null;
        wakeLockBtn.textContent = 'Aus';
        wakeLockBtn.classList.remove('active');
    } else {
        try {
            wakeLockSentinel = await navigator.wakeLock.request('screen');
            wakeLockBtn.textContent = 'An 🔆';
            wakeLockBtn.classList.add('active');
            wakeLockSentinel.addEventListener('release', () => {
                wakeLockSentinel = null;
                wakeLockBtn.textContent = 'Aus';
                wakeLockBtn.classList.remove('active');
            });
        } catch (err) {
            alert('Display-Wachhaltemodus konnte nicht aktiviert werden.');
        }
    }
});

// --- KOMBINIERTES MHD-SYSTEM ---
function parseFlexibleDateToIso(rawStr) {
    const val = (rawStr || '').trim();
    if (!val) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;

    const expandYear = (yStr) => yStr.length === 2 ? 2000 + parseInt(yStr, 10) : parseInt(yStr, 10);
    const isValidDate = (y, m, d) => {
        if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return false;
        const dt = new Date(y, m - 1, d);
        return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
    };
    const toIso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    const parts = val.split(/[./-]+/).filter(Boolean);
    if (parts.length === 2) {
        const m = parseInt(parts[0], 10);
        const y = expandYear(parts[1]);
        if (m >= 1 && m <= 12 && y >= 2000 && y <= 2100) {
            const lastDay = new Date(y, m, 0).getDate();
            return toIso(y, m, lastDay);
        }
        return null;
    }
    if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const y = expandYear(parts[2]);
        return isValidDate(y, m, d) ? toIso(y, m, d) : null;
    }

    if (/^\d+$/.test(val)) {
        if (val.length === 4) {
            const m = parseInt(val.slice(0, 2), 10);
            const y = expandYear(val.slice(2, 4));
            if (m >= 1 && m <= 12) {
                const lastDay = new Date(y, m, 0).getDate();
                return toIso(y, m, lastDay);
            }
        } else if (val.length === 6) {
            const mFirst = parseInt(val.slice(0, 2), 10);
            const yFour = parseInt(val.slice(2, 6), 10);
            if (mFirst >= 1 && mFirst <= 12 && yFour >= 2020 && yFour <= 2099) {
                const lastDay = new Date(yFour, mFirst, 0).getDate();
                return toIso(yFour, mFirst, lastDay);
            }
            const d = parseInt(val.slice(0, 2), 10);
            const m = parseInt(val.slice(2, 4), 10);
            const y = expandYear(val.slice(4, 6));
            if (isValidDate(y, m, d)) return toIso(y, m, d);
        } else if (val.length === 8) {
            const d = parseInt(val.slice(0, 2), 10);
            const m = parseInt(val.slice(2, 4), 10);
            const y = parseInt(val.slice(4, 8), 10);
            if (isValidDate(y, m, d)) return toIso(y, m, d);
        }
    }
    return null;
}

function getIsoDateDaysFromNow(daysFromNow) {
    const target = new Date();
    target.setDate(target.getDate() + daysFromNow);
    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

const form = document.getElementById('addForm');
const formCard = document.getElementById('formCard');
const toggleFormBtn = document.getElementById('toggleFormBtn');
const listContainer = document.getElementById('inventoryList');
const shoppingContainer = document.getElementById('shoppingList');
const recipesContainer = document.getElementById('recipesList');
const weekPlanContainer = document.getElementById('weekPlanContainer');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const recipeSearchInput = document.getElementById('recipeSearchInput');
const clearRecipeSearchBtn = document.getElementById('clearRecipeSearchBtn');
const filterRecipeCategory = document.getElementById('filterRecipeCategory');
const groupRecipesBy = document.getElementById('groupRecipesBy');
const quickCheckBanner = document.getElementById('quickCheckBanner');
const filterCategory = document.getElementById('filterCategory');
const filterLocation = document.getElementById('filterLocation');
const groupPantryBy = document.getElementById('groupPantryBy');
const syncStatus = document.getElementById('syncStatus');
const mhdInput = document.getElementById('mhd');
const mhdCalendar = document.getElementById('mhdCalendar');
const mhdIsoValue = document.getElementById('mhdIsoValue');
const mhdHint = document.getElementById('mhdHint');
const mhdParsedPreview = document.getElementById('mhdParsedPreview');

function syncMhdStateFromText() {
    const raw = mhdInput.value.trim();
    if (!raw) {
        mhdIsoValue.value = '';
        mhdCalendar.value = '';
        mhdParsedPreview.textContent = '';
        mhdParsedPreview.classList.remove('invalid');
        return;
    }
    const iso = parseFlexibleDateToIso(raw);
    if (iso) {
        mhdIsoValue.value = iso;
        mhdCalendar.value = iso;
        const [y, m, d] = iso.split('-');
        mhdParsedPreview.textContent = `✓ Gültig bis ${d}.${m}.${y}`;
        mhdParsedPreview.classList.remove('invalid');
    } else {
        mhdIsoValue.value = '';
        mhdParsedPreview.textContent = 'Format: z.B. 05/28 oder 15.08.27';
        mhdParsedPreview.classList.add('invalid');
    }
}

mhdInput.addEventListener('input', (e) => {
    userTouchedMhd = true;
    mhdHint.style.display = 'none';

    if (e.inputType && e.inputType.startsWith('delete')) {
        syncMhdStateFromText();
        return;
    }

    const digitsOnly = mhdInput.value.replace(/\D/g, '');
    if (/^\d+$/.test(mhdInput.value)) {
        if (digitsOnly.length === 4) {
            const m = parseInt(digitsOnly.slice(0, 2), 10);
            const secondPair = parseInt(digitsOnly.slice(2, 4), 10);
            if (m >= 1 && m <= 12 && secondPair > 12) {
                mhdInput.value = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2, 4)}`;
            }
        } else if (digitsOnly.length === 6) {
            const yFour = parseInt(digitsOnly.slice(2, 6), 10);
            if (yFour >= 2020 && yFour <= 2099) {
                mhdInput.value = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2, 6)}`;
            } else {
                mhdInput.value = `${digitsOnly.slice(0, 2)}.${digitsOnly.slice(2, 4)}.${digitsOnly.slice(4, 6)}`;
            }
        } else if (digitsOnly.length === 8) {
            mhdInput.value = `${digitsOnly.slice(0, 2)}.${digitsOnly.slice(2, 4)}.${digitsOnly.slice(4, 8)}`;
        }
    }
    syncMhdStateFromText();
});

function handleCalendarPick() {
    const iso = mhdCalendar.value;
    userTouchedMhd = true;
    mhdHint.style.display = 'none';
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        const [y, m, d] = iso.split('-');
        mhdInput.value = `${d}.${m}.${y}`;
        mhdIsoValue.value = iso;
        mhdParsedPreview.textContent = `✓ Gültig bis ${d}.${m}.${y}`;
        mhdParsedPreview.classList.remove('invalid');
    } else {
        mhdInput.value = '';
        mhdIsoValue.value = '';
        mhdParsedPreview.textContent = '';
    }
}

mhdCalendar.addEventListener('change', handleCalendarPick);
mhdCalendar.addEventListener('input', handleCalendarPick);

function setSuggestedMhd(daysFromNow, reasonText, forceOverride = false) {
    if (userTouchedMhd && !forceOverride) return;
    const iso = getIsoDateDaysFromNow(daysFromNow);
    const [yyyy, mm, dd] = iso.split('-');
    mhdInput.value = `${dd}.${mm}.${yyyy}`;
    mhdCalendar.value = iso;
    mhdIsoValue.value = iso;
    mhdParsedPreview.textContent = `✓ Gültig bis ${dd}.${mm}.${yyyy}`;
    mhdParsedPreview.classList.remove('invalid');
    mhdHint.style.display = 'block';
    mhdHint.textContent = `💡 Richtwert-MHD vorgeschlagen (+${daysFromNow} Tage – ${reasonText})`;
}

function clearNutritionFields() {
    ['nutKcal', 'nutProtein', 'nutCarbs', 'nutFat', 'nutSugar', 'nutSalt'].forEach(id => {
        document.getElementById(id).value = '';
    });
}

function fillNutritionFields(nut) {
    if (!nut) {
        clearNutritionFields();
        return;
    }
    document.getElementById('nutKcal').value = nut.kcal ?? '';
    document.getElementById('nutProtein').value = nut.p ?? '';
    document.getElementById('nutCarbs').value = nut.c ?? '';
    document.getElementById('nutFat').value = nut.f ?? '';
    document.getElementById('nutSugar').value = nut.sugar ?? '';
    document.getElementById('nutSalt').value = nut.salt ?? '';
}

function readNutritionFields() {
    const kcal = parseFloat(document.getElementById('nutKcal').value);
    const p = parseFloat(document.getElementById('nutProtein').value);
    const c = parseFloat(document.getElementById('nutCarbs').value);
    const f = parseFloat(document.getElementById('nutFat').value);
    const sugar = parseFloat(document.getElementById('nutSugar').value);
    const salt = parseFloat(document.getElementById('nutSalt').value);

    if ([kcal, p, c, f, sugar, salt].every(v => isNaN(v))) return null;
    return {
        kcal: !isNaN(kcal) ? kcal : 0,
        p: !isNaN(p) ? p : 0,
        c: !isNaN(c) ? c : 0,
        f: !isNaN(f) ? f : 0,
        sugar: !isNaN(sugar) ? sugar : 0,
        salt: !isNaN(salt) ? salt : 0
    };
}

function resetItemFormFieldsOnly() {
    form.reset();
    userTouchedMhd = false;
    mhdHint.style.display = 'none';
    mhdParsedPreview.textContent = '';
    mhdIsoValue.value = '';
    mhdCalendar.value = '';
    clearNutritionFields();
    document.getElementById('editId').value = '';
    document.getElementById('lastScannedBarcode').value = '';
    document.getElementById('amount').value = 1;
    document.getElementById('formTitle').textContent = 'Neuer Artikel';
    document.getElementById('submitBtn').textContent = '+ In den Schrank';
    document.getElementById('saveAndNextItemBtn').classList.remove('hidden');
}

toggleFormBtn.addEventListener('click', () => {
    if (formCard.classList.contains('hidden')) {
        resetItemFormFieldsOnly();
        document.getElementById('scan-feedback').style.display = 'none';
        formCard.classList.remove('hidden');
        toggleFormBtn.classList.add('hidden');
        document.getElementById('name').focus();
    }
});

function closeFormCard() {
    stopScanner();
    resetItemFormFieldsOnly();
    document.getElementById('scan-feedback').style.display = 'none';
    formCard.classList.add('hidden');
    toggleFormBtn.classList.remove('hidden');
}

document.getElementById('cancelEditBtn').addEventListener('click', closeFormCard);

const tabVorratBtn = document.getElementById('tabVorratBtn');
const tabEinkaufBtn = document.getElementById('tabEinkaufBtn');
const tabRezepteBtn = document.getElementById('tabRezepteBtn');
const viewVorrat = document.getElementById('viewVorrat');
const viewEinkauf = document.getElementById('viewEinkauf');
const viewRezepte = document.getElementById('viewRezepte');

function switchTab(activeTab) {
    [tabVorratBtn, tabEinkaufBtn, tabRezepteBtn].forEach(b => b.classList.remove('active'));
    [viewVorrat, viewEinkauf, viewRezepte].forEach(v => v.classList.add('hidden'));

    if (activeTab === 'VORRAT') {
        tabVorratBtn.classList.add('active');
        viewVorrat.classList.remove('hidden');
    } else if (activeTab === 'EINKAUF') {
        tabEinkaufBtn.classList.add('active');
        viewEinkauf.classList.remove('hidden');
        renderStaplesRow();
    } else if (activeTab === 'REZEPTE') {
        tabRezepteBtn.classList.add('active');
        viewRezepte.classList.remove('hidden');
        renderRecipes();
    }
}

tabVorratBtn.addEventListener('click', () => switchTab('VORRAT'));
tabEinkaufBtn.addEventListener('click', () => switchTab('EINKAUF'));
tabRezepteBtn.addEventListener('click', () => switchTab('REZEPTE'));

// Vorrats-Chips
const chipAll = document.getElementById('chipAll');
const chipOpened = document.getElementById('chipOpened');
const chipExpiring = document.getElementById('chipExpiring');
const chipLow = document.getElementById('chipLow');

function setQuickFilter(mode) {
    activeQuickFilter = mode;
    chipAll.classList.toggle('active', mode === 'ALL');
    chipOpened.classList.toggle('active', mode === 'OPENED');
    chipExpiring.classList.toggle('active', mode === 'EXPIRING');
    chipLow.classList.toggle('active', mode === 'LOW');
    renderList();
}

chipAll.addEventListener('click', () => setQuickFilter('ALL'));
chipOpened.addEventListener('click', () => setQuickFilter('OPENED'));
chipExpiring.addEventListener('click', () => setQuickFilter('EXPIRING'));
chipLow.addEventListener('click', () => setQuickFilter('LOW'));

// Rezept-Chips
const recChipAll = document.getElementById('recChipAll');
const recChipReady = document.getElementById('recChipReady');
const recChipWeek = document.getElementById('recChipWeek');
const recChipMissing = document.getElementById('recChipMissing');

function setRecipeFilter(mode) {
    activeRecipeFilter = mode;
    activeRecipeTagFilter = '';
    recChipAll.classList.toggle('active', mode === 'ALL');
    recChipReady.classList.toggle('active', mode === 'READY');
    recChipWeek.classList.toggle('active', mode === 'WEEK');
    recChipMissing.classList.toggle('active', mode === 'MISSING');
    document.querySelectorAll('.rec-tag-filter').forEach(b => b.classList.remove('active'));
    renderRecipes();
}

recChipAll.addEventListener('click', () => setRecipeFilter('ALL'));
recChipReady.addEventListener('click', () => setRecipeFilter('READY'));
recChipWeek.addEventListener('click', () => setRecipeFilter('WEEK'));
recChipMissing.addEventListener('click', () => setRecipeFilter('MISSING'));

document.querySelectorAll('.rec-tag-filter').forEach(btn => {
    btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        if (activeRecipeTagFilter === tag) {
            setRecipeFilter('ALL');
        } else {
            activeRecipeFilter = 'ALL';
            activeRecipeTagFilter = tag;
            [recChipAll, recChipReady, recChipWeek, recChipMissing].forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.rec-tag-filter').forEach(b => b.classList.toggle('active', b.dataset.tag === tag));
            renderRecipes();
        }
    });
});

filterRecipeCategory.addEventListener('change', renderRecipes);
groupRecipesBy.addEventListener('change', renderRecipes);

function suggestStorageAndCategory(productName, barcodeTags = '', targetCatId = 'category', targetLocId = 'location', suggestMhd = true) {
    const res = detectCategoryAndLocation(productName, barcodeTags);
    const catEl = document.getElementById(targetCatId);
    const locEl = targetLocId ? document.getElementById(targetLocId) : null;
    if (catEl) catEl.value = res.category;
    if (locEl) locEl.value = res.location;
    if (suggestMhd && res.mhdDays) {
        setSuggestedMhd(res.mhdDays, res.mhdReason);
    }
}

document.getElementById('name').addEventListener('input', (e) => {
    if (!document.getElementById('editId').value) {
        suggestStorageAndCategory(e.target.value, '', 'category', 'location', true);
        const autoNut = lookupNutritionPer100g(e.target.value);
        if (autoNut) fillNutritionFields(autoNut);
    }
});

document.getElementById('location').addEventListener('change', (e) => {
    if (e.target.value === 'Gefriertruhe') {
        const freezeInfo = getFreezeDurationDays(
            document.getElementById('name').value,
            document.getElementById('category').value
        );
        setSuggestedMhd(freezeInfo.days, freezeInfo.reason, Boolean(document.getElementById('editId').value));
    }
});

document.getElementById('shopName').addEventListener('input', (e) => {
    suggestStorageAndCategory(e.target.value, '', 'shopCategory', null, false);
});

// --- BARCODE SCANNER INKL. OFFLINE-GEDÄCHTNIS & NÄHRWERT-SCRAPER ---
const toggleScanBtn = document.getElementById('toggleScanBtn');
const readerWrapper = document.getElementById('reader-wrapper');
const scanFeedback = document.getElementById('scan-feedback');
let html5QrCode = null;
let isScanning = false;

function showFeedback(text, isError = false) {
    scanFeedback.style.display = 'block';
    scanFeedback.style.color = isError ? 'var(--danger)' : 'var(--primary)';
    scanFeedback.textContent = text;
}

async function stopScanner() {
    if (html5QrCode && isScanning) {
        try {
            await html5QrCode.stop();
            html5QrCode.clear();
        } catch (err) {}
    }
    isScanning = false;
    readerWrapper.style.display = 'none';
    toggleScanBtn.textContent = '📷 Scannen';
    toggleScanBtn.classList.remove('active');
}

function applyCachedBarcodeToForm(barcode, c, sourceText) {
    document.getElementById('name').value = c.name || '';
    document.getElementById('amount').value = c.amount || 1;
    document.getElementById('unit').value = c.unit || 'Stk.';
    document.getElementById('category').value = normalizeCategoryKey(c.category);
    document.getElementById('location').value = c.location || 'Vorratsschrank';
    if (c.minAmount) document.getElementById('minAmount').value = c.minAmount;
    if (c.nutrition) fillNutritionFields(c.nutrition);
    else {
        const fallbackNut = lookupNutritionPer100g(c.name || '');
        if (fallbackNut) fillNutritionFields(fallbackNut);
    }
    const detected = detectCategoryAndLocation(c.name || '');
    if (detected.mhdDays) {
        setSuggestedMhd(detected.mhdDays, detected.mhdReason);
    }
    showFeedback(`${sourceText}: "${c.name}"`);
}

async function fetchProductByBarcode(barcode) {
    document.getElementById('lastScannedBarcode').value = barcode;
    showFeedback(`🔍 Suche Produkt & Nährwerte für Code ${barcode}...`);

    // 1. Sofort im lokalen Offline-Gedächtnis nachsehen
    if (barcodeMemory[barcode] && barcodeMemory[barcode].name) {
        applyCachedBarcodeToForm(barcode, barcodeMemory[barcode], '⚡ Aus Offline-Barcode-Gedächtnis geladen');
        return;
    }

    // 2. Falls nicht lokal vorhanden, in Firebase nachsehen
    try {
        const customSnap = await getDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "barcodes", barcode));
        if (customSnap.exists()) {
            const c = customSnap.data();
            barcodeMemory[barcode] = c;
            saveLocalBarcodeMemory();
            applyCachedBarcodeToForm(barcode, c, '⭐ Aus Haushalts-Barcode-Gedächtnis geladen');
            return;
        }
    } catch (e) {}

    // 3. Online bei OpenFoodFacts abfragen und danach lokal + Cloud merken
    try {
        const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
        const data = await response.json();

        if (data.status === 1 && data.product) {
            const p = data.product;
            const brand = p.brands ? p.brands.split(',')[0].trim() : '';
            const prodName = p.product_name_de || p.product_name || '';
            const rawName = [brand, prodName].filter(Boolean).join(' - ');
            const fullName = rawName.replace(/\b\d{8,14}\b/g, '').replace(/\s*-\s*$/g, '').replace(/^\s*-\s*/g, '').trim();

            if (fullName) document.getElementById('name').value = fullName;

            let parsedAmt = 1;
            let parsedUnit = 'Stk.';
            if (p.product_quantity && p.product_quantity_unit) {
                const qty = parseFloat(p.product_quantity);
                const unitRaw = p.product_quantity_unit.toLowerCase();
                if (!isNaN(qty)) {
                    if (unitRaw === 'g') { parsedAmt = qty; parsedUnit = 'g'; }
                    else if (unitRaw === 'kg') { parsedAmt = qty; parsedUnit = 'kg'; }
                    else if (unitRaw === 'ml') { parsedAmt = qty; parsedUnit = 'ml'; }
                    else if (unitRaw === 'l') { parsedAmt = qty; parsedUnit = 'l'; }
                }
            }
            document.getElementById('amount').value = parsedAmt;
            document.getElementById('unit').value = parsedUnit;

            const n = p.nutriments || {};
            const scrapedNut = {
                kcal: n['energy-kcal_100g'] ?? (n['energy_100g'] ? Math.round(n['energy_100g'] / 4.184) : null),
                p: n['proteins_100g'] ?? null,
                c: n['carbohydrates_100g'] ?? null,
                f: n['fat_100g'] ?? null,
                sugar: n['sugars_100g'] ?? null,
                salt: n['salt_100g'] ?? null
            };
            const hasScrapedNut = Object.values(scrapedNut).some(v => v !== null && !isNaN(v));
            const finalNut = hasScrapedNut ? scrapedNut : lookupNutritionPer100g(fullName);
            if (finalNut) fillNutritionFields(finalNut);

            const rawTags = [
                ...(p.categories_tags || []),
                p.categories || '',
                p.pnns_groups_1 || '',
                p.pnns_groups_2 || ''
            ].join(' ').toLowerCase();

            suggestStorageAndCategory(fullName, rawTags, 'category', 'location', true);

            if (fullName) {
                await rememberBarcodeEntry(barcode, {
                    name: fullName,
                    amount: parsedAmt,
                    unit: parsedUnit,
                    category: document.getElementById('category').value,
                    location: document.getElementById('location').value,
                    nutrition: finalNut || null
                });
            }

            const nutInfoText = hasScrapedNut ? ` (${Math.round(scrapedNut.kcal || 0)} kcal/100g erfasst)` : '';
            showFeedback(`✅ Gefunden & gemerkt: "${fullName || barcode}"${nutInfoText} – bitte prüfen!`);
        } else {
            showFeedback(`⚠️ Unbekannter Code (${barcode}). Einmal eingeben – die App merkt ihn sich auch offline!`, true);
        }
    } catch (error) {
        showFeedback(`📴 Offline & Code (${barcode}) noch unbekannt. Einmal eintippen – beim nächsten Scan wird er offline erkannt!`, true);
    }
}

toggleScanBtn.addEventListener('click', async () => {
    if (isScanning) { await stopScanner(); return; }
    readerWrapper.style.display = 'block';
    toggleScanBtn.textContent = '⏹️ Stopp';
    toggleScanBtn.classList.add('active');
    scanFeedback.style.display = 'none';

    html5QrCode = new Html5Qrcode("reader");
    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 150 } },
            async (decodedText) => {
                await stopScanner();
                if (navigator.vibrate) navigator.vibrate(100);
                await fetchProductByBarcode(decodedText);
            },
            () => {}
        );
        isScanning = true;
    } catch (err) {
        await stopScanner();
        showFeedback('❌ Kamera konnte nicht gestartet werden.', true);
    }
});

// --- AUTOCOMPLETE DATALIST ---
function refreshAutocompleteDatalist() {
    const names = new Set();
    inventory.forEach(i => { if (i.name) names.add(i.name.trim()); });
    Object.values(barcodeMemory).forEach(b => { if (b && b.name) names.add(b.name.trim()); });
    Object.values(yearlyStats).forEach(yData => {
        if (yData && yData.items) {
            Object.values(yData.items).forEach(entry => {
                if (entry.name) names.add(entry.name.trim());
            });
        }
    });
    Object.values(learnedNutritionDict).forEach(entry => {
        if (entry.name) names.add(entry.name.trim());
    });
    const datalist = document.getElementById('pantrySuggestions');
    datalist.innerHTML = '';
    Array.from(names).sort((a, b) => a.localeCompare(b)).forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        datalist.appendChild(opt);
    });
}

// --- FIREBASE ECHTZEIT-LISTENERS ---
onSnapshot(vorratRef, (snapshot) => {
    inventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    document.getElementById('vorratCount').textContent = inventory.length;
    syncStatus.textContent = "🟢 Live";
    updateAlertBadge();
    refreshAutocompleteDatalist();
    renderList();
    if (!viewRezepte.classList.contains('hidden')) renderRecipes();
}, () => {
    syncStatus.textContent = "🔴 Offline";
});

onSnapshot(einkaufRef, (snapshot) => {
    shoppingItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    document.getElementById('einkaufCount').textContent = shoppingItems.length;
    renderShoppingList();
});

onSnapshot(rezepteRef, (snapshot) => {
    recipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    document.getElementById('rezepteCount').textContent = recipes.length;
    renderRecipes();
});

onSnapshot(statsRef, (snapshot) => {
    yearlyStats = {};
    snapshot.docs.forEach(d => {
        yearlyStats[d.id] = d.data();
    });
    refreshAutocompleteDatalist();
    if (!viewEinkauf.classList.contains('hidden')) renderStaplesRow();
});

onSnapshot(naehrwerteRef, (snapshot) => {
    learnedNutritionDict = {};
    snapshot.docs.forEach(d => {
        learnedNutritionDict[d.id] = d.data();
    });
    refreshAutocompleteDatalist();
    if (!viewRezepte.classList.contains('hidden')) renderRecipes();
});

onSnapshot(barcodesRef, (snapshot) => {
    let changed = false;
    snapshot.docs.forEach(d => {
        if (!barcodeMemory[d.id]) {
            barcodeMemory[d.id] = d.data();
            changed = true;
        }
    });
    if (changed) {
        saveLocalBarcodeMemory();
        refreshAutocompleteDatalist();
    }
});

function updateAlertBadge() {
    let alertCount = 0;
    inventory.forEach(item => {
        const mhd = getMhdInfo(item.mhd);
        const isLow = item.minAmount && item.amount <= item.minAmount;
        if (mhd.diffDays <= 14 || isLow) alertCount++;
    });
    const badge = document.getElementById('vorratAlertBadge');
    if (alertCount > 0) {
        badge.textContent = `⚠️ ${alertCount}`;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

async function logConsumption(item, consumedAmount) {
    const year = String(new Date().getFullYear());
    const yearDocRef = doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "statistik", year);
    const safeKey = item.name.trim().replace(/[.$/[\]#]/g, '_');
    const catKey = normalizeCategoryKey(item.category);

    try {
        await setDoc(yearDocRef, {
            totalActions: increment(1),
            [`items.${safeKey}.name`]: item.name.trim(),
            [`items.${safeKey}.count`]: increment(1),
            [`items.${safeKey}.totalQty`]: increment(consumedAmount),
            [`items.${safeKey}.unit`]: item.unit || 'Stk.',
            [`categories.${catKey}`]: increment(1)
        }, { merge: true });
    } catch (e) {
        console.warn("Statistik-Update fehlgeschlagen:", e);
    }
}

// --- VORRATS-FORMULAR SPEICHERN INKL. SMART-MERGE ---
async function saveInventoryItem(keepOpenForNext = false) {
    const nameVal = document.getElementById('name').value.trim();
    const amountVal = parseFloat(document.getElementById('amount').value);

    if (!nameVal) {
        alert('Bitte einen Artikelnamen eingeben.');
        document.getElementById('name').focus();
        return;
    }
    if (isNaN(amountVal) || amountVal <= 0) {
        alert('Bitte eine gültige Menge größer als 0 eingeben.');
        document.getElementById('amount').focus();
        return;
    }

    const rawMhd = mhdInput.value.trim();
    let parsedIsoMhd = mhdIsoValue.value || '';

    if (rawMhd && !parsedIsoMhd) {
        parsedIsoMhd = parseFlexibleDateToIso(rawMhd);
    }

    if (rawMhd && !parsedIsoMhd) {
        alert('Bitte ein gültiges MHD eingeben (z. B. 05/28 oder 15.08.27) oder über das Kalender-Symbol auswählen.');
        mhdInput.focus();
        return;
    }

    const editId = document.getElementById('editId').value;
    const scannedBarcode = document.getElementById('lastScannedBarcode').value;
    const minVal = parseFloat(document.getElementById('minAmount').value);
    const nutritionObj = readNutritionFields();
    const chosenCat = normalizeCategoryKey(document.getElementById('category').value);
    const chosenLoc = document.getElementById('location').value;

    const itemData = {
        name: nameVal,
        amount: amountVal,
        unit: document.getElementById('unit').value,
        category: chosenCat,
        location: chosenLoc,
        mhd: parsedIsoMhd,
        minAmount: !isNaN(minVal) && minVal > 0 ? minVal : null,
        nutrition: nutritionObj,
        barcode: scannedBarcode || null
    };

    if (scannedBarcode) {
        await rememberBarcodeEntry(scannedBarcode, itemData);
    }

    // Smart-Merge bei Doppel-Scan / neuem Einräumen
    if (!editId) {
        const candidates = inventory.filter(i => {
            if (i.isOpened) return false;
            const sameBarcode = scannedBarcode && i.barcode && i.barcode === scannedBarcode && i.unit === itemData.unit && (i.location || 'Vorratsschrank') === itemData.location;
            const sameNameAndLoc = i.name.trim().toLowerCase() === itemData.name.toLowerCase() && i.unit === itemData.unit && (i.location || 'Vorratsschrank') === itemData.location;
            return sameBarcode || sameNameAndLoc;
        });

        if (candidates.length > 0) {
            const exactMhdMatch = candidates.find(c => (c.mhd || '') === (itemData.mhd || ''));
            const targetMatch = exactMhdMatch || candidates[0];
            const combinedQty = Math.round((targetMatch.amount + itemData.amount) * 100) / 100;

            if (exactMhdMatch) {
                // Gleicher Artikel, gleicher Lagerort, gleiches MHD -> direkt intelligent zusammenführen!
                await updateDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "vorrat", targetMatch.id), {
                    amount: combinedQty,
                    barcode: scannedBarcode || targetMatch.barcode || null,
                    nutrition: nutritionObj || targetMatch.nutrition || null
                });

                if (keepOpenForNext) {
                    resetItemFormFieldsOnly();
                    showFeedback(`🔄 Smart-Merge: "${targetMatch.name}" auf ${combinedQty} ${targetMatch.unit} erhöht!`);
                    document.getElementById('name').focus();
                } else {
                    closeFormCard();
                    alert(`🔄 Smart-Merge: "${targetMatch.name}" war bereits im ${targetMatch.location} – Bestand wurde auf ${combinedQty} ${targetMatch.unit} erhöht.`);
                }
                return;
            } else {
                // Abweichendes MHD -> kurz nachfragen, ob zusammengeführt (kürzeres MHD behalten) oder separat angelegt werden soll
                const oldMhdText = targetMatch.mhd ? new Date(targetMatch.mhd).toLocaleDateString('de-DE') : 'kein MHD';
                const newMhdText = itemData.mhd ? new Date(itemData.mhd).toLocaleDateString('de-DE') : 'kein MHD';
                const earlierMhd = [targetMatch.mhd, itemData.mhd].filter(Boolean).sort()[0] || '';

                if (confirm(`🔄 "${targetMatch.name}" (${targetMatch.location}) liegt schon mit ${targetMatch.amount} ${targetMatch.unit} im Vorrat (MHD: ${oldMhdText}, neu: ${newMhdText}).\n\n• OK = Zusammenführen auf ${combinedQty} ${targetMatch.unit} (kürzeres MHD behalten)\n• Abbrechen = Als separaten Eintrag mit eigenem MHD anlegen`)) {
                    await updateDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "vorrat", targetMatch.id), {
                        amount: combinedQty,
                        mhd: earlierMhd,
                        barcode: scannedBarcode || targetMatch.barcode || null,
                        nutrition: nutritionObj || targetMatch.nutrition || null
                    });

                    if (keepOpenForNext) {
                        resetItemFormFieldsOnly();
                        showFeedback(`🔄 Zusammengeführt: "${targetMatch.name}" (${combinedQty} ${targetMatch.unit})`);
                        document.getElementById('name').focus();
                    } else {
                        closeFormCard();
                    }
                    return;
                }
            }
        }
    }

    if (editId) {
        const existing = inventory.find(i => i.id === editId);
        if (chosenLoc === 'Gefriertruhe' && existing && existing.location !== 'Gefriertruhe') {
            itemData.frozenAt = new Date().toISOString().slice(0, 10);
        }
        await updateDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "vorrat", editId), itemData);
    } else {
        itemData.isOpened = false;
        itemData.openedAt = null;
        itemData.frozenAt = chosenLoc === 'Gefriertruhe' ? new Date().toISOString().slice(0, 10) : null;
        await addDoc(vorratRef, itemData);
    }

    if (keepOpenForNext) {
        resetItemFormFieldsOnly();
        showFeedback(`✅ "${itemData.name}" eingeräumt – bereit für den nächsten Artikel!`);
        document.getElementById('name').focus();
    } else {
        closeFormCard();
    }
}

form.addEventListener('submit', async function(e) {
    e.preventDefault();
    await saveInventoryItem(false);
});

document.getElementById('saveAndNextItemBtn').addEventListener('click', async function() {
    await saveInventoryItem(true);
});

window.toggleOpened = async function(id) {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    const nextOpened = !item.isOpened;
    await updateDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "vorrat", id), {
        isOpened: nextOpened,
        openedAt: nextOpened ? new Date().toISOString().slice(0, 10) : null
    });
};

// --- NACHTRÄGLICHES EINFRIEREN (INKL. TEILMENGEN-SPLIT & MHD-UPDATE) ---
window.freezeItem = async function(id) {
    const item = inventory.find(i => i.id === id);
    if (!item || item.location === 'Gefriertruhe') return;

    const freezeMeta = getFreezeDurationDays(item.name, item.category);
    const newMhdIso = getIsoDateDaysFromNow(freezeMeta.days);
    const newMhdFormatted = new Date(newMhdIso).toLocaleDateString('de-DE');
    const todayIso = new Date().toISOString().slice(0, 10);

    const rawInput = prompt(
        `🧊 "${item.name}" einfrieren (${freezeMeta.reason}, neues MHD: ${newMhdFormatted}):\n\nWie viel davon frierst du ein? (Gesamtbestand: ${item.amount} ${item.unit})`,
        String(item.amount)
    );
    if (rawInput === null) return;

    const freezeQty = parseFloat(rawInput.replace(',', '.'));
    if (isNaN(freezeQty) || freezeQty <= 0 || freezeQty > item.amount) {
        alert(`Bitte eine gültige Menge zwischen 0,1 und ${item.amount} ${item.unit} eingeben.`);
        return;
    }

    if (freezeQty >= item.amount) {
        // Kompletten Artikel in die Gefriertruhe verschieben
        await updateDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "vorrat", id), {
            location: 'Gefriertruhe',
            mhd: newMhdIso,
            frozenAt: todayIso
        });
        alert(`🧊 "${item.name}" (${item.amount} ${item.unit}) wurde in die Gefriertruhe verschoben (MHD: ${newMhdFormatted}).`);
    } else {
        // Teilmenge einfrieren -> Rest im bisherigen Lagerort lassen & neuen Gefriertruhen-Eintrag anlegen
        const remainingQty = Math.round((item.amount - freezeQty) * 100) / 100;
        await updateDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "vorrat", id), {
            amount: remainingQty
        });

        await addDoc(vorratRef, {
            name: item.name,
            amount: freezeQty,
            unit: item.unit,
            category: normalizeCategoryKey(item.category),
            location: 'Gefriertruhe',
            mhd: newMhdIso,
            minAmount: null,
            nutrition: item.nutrition || null,
            barcode: item.barcode || null,
            isOpened: item.isOpened || false,
            openedAt: item.openedAt || null,
            frozenAt: todayIso
        });

        alert(`🧊 ${freezeQty} ${item.unit} "${item.name}" eingefroren (MHD: ${newMhdFormatted}). ${remainingQty} ${item.unit} bleiben im ${item.location || 'Vorratsschrank'}.`);
    }
};

// --- AUF EINEN SCHLAG VERBRAUCHEN ---
window.consumeAllItem = async function(id) {
    const item = inventory.find(i => i.id === id);
    if (!item) return;

    if (!confirm(`✅ "${item.name}" (${item.amount} ${item.unit}) komplett als verbraucht buchen?`)) {
        return;
    }

    await logConsumption(item, item.amount);
    await deleteDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "vorrat", id));

    const alreadyOnList = shoppingItems.some(s => s.name.trim().toLowerCase() === item.name.trim().toLowerCase() && !s.inCart);
    if (!alreadyOnList && confirm(`🛒 Soll "${item.name}" direkt auf eure Einkaufsliste gesetzt werden?`)) {
        await addDoc(einkaufRef, {
            name: item.name,
            note: 'Nachkauf',
            category: normalizeCategoryKey(item.category),
            location: item.location || 'Vorratsschrank',
            unit: item.unit || 'Stk.',
            inCart: false
        });
    }
};

window.findRecipesWithIngredient = function(itemName) {
    switchTab('REZEPTE');
    setRecipeFilter('ALL');
    filterRecipeCategory.value = 'ALLE';
    recipeSearchInput.value = itemName;
    renderRecipes();
};

window.editItem = function(id) {
    const item = inventory.find(i => i.id === id);
    if (!item) return;

    userTouchedMhd = true;
    mhdHint.style.display = 'none';
    formCard.classList.remove('hidden');
    toggleFormBtn.classList.add('hidden');
    document.getElementById('saveAndNextItemBtn').classList.add('hidden');

    document.getElementById('editId').value = item.id;
    document.getElementById('name').value = item.name;
    document.getElementById('amount').value = item.amount;
    document.getElementById('unit').value = item.unit;
    document.getElementById('category').value = normalizeCategoryKey(item.category);
    document.getElementById('location').value = item.location || 'Vorratsschrank';
    document.getElementById('minAmount').value = item.minAmount || '';
    fillNutritionFields(item.nutrition || lookupNutritionPer100g(item.name));

    if (item.mhd && /^\d{4}-\d{2}-\d{2}$/.test(item.mhd)) {
        const [y, m, d] = item.mhd.split('-');
        mhdInput.value = `${d}.${m}.${y}`;
        mhdCalendar.value = item.mhd;
        mhdIsoValue.value = item.mhd;
    } else {
        mhdInput.value = item.mhd || '';
        mhdCalendar.value = '';
        mhdIsoValue.value = '';
    }
    syncMhdStateFromText();

    document.getElementById('formTitle').textContent = '✏️ Artikel bearbeiten';
    document.getElementById('submitBtn').textContent = '💾 Änderungen speichern';
    formCard.scrollIntoView({ behavior: 'smooth' });
};

window.changeAmount = async function(id, delta) {
    const item = inventory.find(i => i.id === id);
    if (!item) return;

    const step = (item.unit === 'g' || item.unit === 'ml') ? 50 : ((item.unit === 'kg' || item.unit === 'l') ? 0.5 : 1);
    const newAmount = Math.round((item.amount + (delta * step)) * 10) / 10;
    const itemDoc = doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "vorrat", id);

    if (delta < 0) {
        const consumed = Math.min(item.amount, step);
        logConsumption(item, consumed);
    }

    if (newAmount <= 0) {
        if (confirm(`"${item.name}" ist leer. Aus dem Vorrat löschen und auf die Einkaufsliste setzen?`)) {
            await addDoc(einkaufRef, {
                name: item.name,
                note: `Nachkauf`,
                category: normalizeCategoryKey(item.category),
                location: item.location || 'Vorratsschrank',
                unit: item.unit,
                inCart: false
            });
            await deleteDoc(itemDoc);
        } else if (confirm(`Nur aus dem Vorrat löschen (ohne Einkaufsliste)?`)) {
            await deleteDoc(itemDoc);
        }
    } else {
        await updateDoc(itemDoc, { amount: newAmount });
        if (delta < 0 && item.minAmount && newAmount <= item.minAmount) {
            const alreadyOnList = shoppingItems.some(s => s.name.toLowerCase() === item.name.toLowerCase());
            if (!alreadyOnList && confirm(`📉 "${item.name}" hat den Mindestbestand (${item.minAmount} ${item.unit}) erreicht. Schon auf die Einkaufsliste setzen?`)) {
                await addDoc(einkaufRef, {
                    name: item.name,
                    note: `Nachkauf (Rest: ${newAmount} ${item.unit})`,
                    category: normalizeCategoryKey(item.category),
                    location: item.location || 'Vorratsschrank',
                    unit: item.unit,
                    inCart: false
                });
            }
        }
    }
};

window.quickAddToShopping = async function(itemName, category = null, note = '') {
    const detectedCat = normalizeCategoryKey(category || detectCategoryAndLocation(itemName).category);
    const existing = shoppingItems.find(s => s.name.trim().toLowerCase() === itemName.trim().toLowerCase() && !s.inCart);

    if (existing) {
        if (note) {
            const combinedNote = existing.note ? `${existing.note} + ${note}` : note;
            await updateDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "einkaufsliste", existing.id), {
                note: combinedNote
            });
            alert(`🛒 "${itemName}" stand schon auf der Liste – Notiz wurde ergänzt!`);
        } else {
            alert(`🛒 "${itemName}" steht bereits auf eurer Einkaufsliste!`);
        }
        return;
    }

    await addDoc(einkaufRef, {
        name: itemName.trim(),
        note: note,
        category: detectedCat,
        location: 'Vorratsschrank',
        unit: 'Stk.',
        inCart: false
    });
    alert(`🛒 "${itemName}" wurde auf die Einkaufsliste gesetzt!`);
};

function getMhdInfo(mhdString) {
    if (!mhdString) return { text: 'Kein MHD', cssClass: '', diffDays: 9999 };
    const today = new Date();
    today.setHours(0,0,0,0);
    const mhdDate = new Date(mhdString);
    const diffDays = Math.ceil((mhdDate - today) / (1000 * 60 * 60 * 24));
    const formattedDate = mhdDate.toLocaleDateString('de-DE');

    if (diffDays < 0) return { text: `⚠️ Abgelaufen (${formattedDate})`, cssClass: 'expired', diffDays };
    if (diffDays <= 14) return { text: `⏳ Bald (${formattedDate})`, cssClass: 'expiring-soon', diffDays };
    return { text: `MHD: ${formattedDate}`, cssClass: '', diffDays };
}

function getOpenedDaysText(openedAtIso) {
    if (!openedAtIso) return '🔓 Angebrochen';
    const today = new Date();
    today.setHours(0,0,0,0);
    const openDate = new Date(openedAtIso);
    const diff = Math.max(0, Math.floor((today - openDate) / (1000 * 60 * 60 * 24)));
    if (diff === 0) return '🔓 Heute geöffnet';
    if (diff === 1) return '🔓 Seit 1 Tag offen';
    return `🔓 Seit ${diff} Tagen offen`;
}

function createPantryCardElement(item) {
    const mhdInfo = getMhdInfo(item.mhd);
    const locText = item.location || 'Vorratsschrank';
    const normCat = normalizeCategoryKey(item.category);
    const catText = categoryLabels[normCat] || normCat;
    const isLow = item.minAmount && item.amount <= item.minAmount;
    const isFrozen = locText === 'Gefriertruhe';
    const statusClass = item.isOpened ? 'opened-item' : (mhdInfo.cssClass || (isFrozen ? 'frozen-item' : (isLow ? 'low-stock' : '')));
    const safeItemName = item.name.replace(/'/g, "\\'");
    const kcalTag = item.nutrition && item.nutrition.kcal ? `<span class="badge badge-kcal">${Math.round(item.nutrition.kcal)} kcal/100g</span>` : '';
    const frozenBadge = item.frozenAt ? `<span class="badge badge-frozen">🧊 Eingefroren (${new Date(item.frozenAt).toLocaleDateString('de-DE')})</span>` : '';

    const card = document.createElement('div');
    card.className = `item-card ${statusClass}`;
    card.innerHTML = `
        <div class="item-info">
            <h3>${item.name}</h3>
            <div class="item-meta">
                ${item.isOpened ? `<span class="badge badge-opened">${getOpenedDaysText(item.openedAt)}</span>` : ''}
                ${frozenBadge}
                <span class="badge">${catText}</span>
                <span class="badge badge-loc">📍 ${locText}</span>
                ${kcalTag}
                ${isLow ? `<span class="badge badge-low">📉 Knapp (Min: ${item.minAmount})</span>` : ''}
                <span>${mhdInfo.text}</span>
            </div>
        </div>
        <div class="controls">
            <button class="icon-btn" onclick="findRecipesWithIngredient('${safeItemName}')" title="Passende Rezepte mit dieser Zutat suchen">🍳</button>
            <button class="icon-btn ${item.isOpened ? 'opened-active' : ''}" onclick="toggleOpened('${item.id}')" title="${item.isOpened ? 'Als geschlossen markieren' : 'Als angebrochen markieren'}">🔓</button>
            ${!isFrozen ? `<button class="icon-btn freeze-btn" onclick="freezeItem('${item.id}')" title="Nachträglich einfrieren & MHD anpassen">🧊</button>` : ''}
            <button class="icon-btn" onclick="editItem('${item.id}')" title="Bearbeiten">✏️</button>
            <button class="icon-btn consume-all-btn" onclick="consumeAllItem('${item.id}')" title="Auf einen Schlag komplett verbrauchen">✅</button>
            <button class="qty-btn" onclick="changeAmount('${item.id}', -1)">-</button>
            <span class="qty-display">${item.amount} ${item.unit}</span>
            <button class="qty-btn" onclick="changeAmount('${item.id}', 1)">+</button>
        </div>
    `;
    return card;
}

function sortPantryItems(items) {
    return [...items].sort((a, b) => {
        if (a.isOpened && !b.isOpened) return -1;
        if (!a.isOpened && b.isOpened) return 1;
        if (!a.mhd && !b.mhd) return (a.name || '').localeCompare(b.name || '');
        if (!a.mhd) return 1;
        if (!b.mhd) return -1;
        return new Date(a.mhd) - new Date(b.mhd);
    });
}

function renderList() {
    const rawSearch = searchInput.value.trim();
    const searchTerm = rawSearch.toLowerCase();
    const selectedCat = filterCategory.value;
    const selectedLoc = filterLocation.value;
    const groupMode = groupPantryBy ? groupPantryBy.value : 'CATEGORY';

    clearSearchBtn.style.display = rawSearch ? 'flex' : 'none';

    let filtered = inventory.filter(item => {
        const matchesName = item.name.toLowerCase().includes(searchTerm);
        const normCat = normalizeCategoryKey(item.category);
        const matchesCat = selectedCat === 'ALLE' || normCat === selectedCat;
        const itemLoc = item.location || 'Vorratsschrank';
        const matchesLoc = selectedLoc === 'ALLE' || itemLoc === selectedLoc;

        const mhd = getMhdInfo(item.mhd);
        const isLow = item.minAmount && item.amount <= item.minAmount;

        if (activeQuickFilter === 'OPENED' && !item.isOpened) return false;
        if (activeQuickFilter === 'EXPIRING' && mhd.diffDays > 14) return false;
        if (activeQuickFilter === 'LOW' && !isLow) return false;

        return matchesName && matchesCat && matchesLoc;
    });

    if (rawSearch.length >= 2) {
        const exactMatches = inventory.filter(i => i.name.toLowerCase().includes(searchTerm));
        quickCheckBanner.style.display = 'block';
        if (exactMatches.length > 0) {
            quickCheckBanner.className = '';
            const summary = exactMatches.map(m => `<strong>${m.amount} ${m.unit}</strong> ${m.name} (${m.location || 'Vorratsschrank'})`).join(' • ');
            quickCheckBanner.innerHTML = `✅ <strong>Im Vorrat:</strong> ${summary}`;
        } else {
            quickCheckBanner.className = 'not-found';
            const safeName = rawSearch.replace(/'/g, "\\'");
            quickCheckBanner.innerHTML = `
                <span>❌ <strong>"${rawSearch}"</strong> nicht im Vorrat!</span>
                <button type="button" class="quick-add-shop-btn" onclick="quickAddToShopping('${safeName}')">+ Einkaufsliste</button>
            `;
        }
    } else {
        quickCheckBanner.style.display = 'none';
    }

    listContainer.innerHTML = '';
    if (filtered.length === 0) {
        listContainer.innerHTML = '<div class="empty-state">Keine passenden Artikel im Vorrat gefunden.</div>';
        return;
    }

    if (groupMode === 'CATEGORY' && selectedCat === 'ALLE') {
        pantryCategoryOrder.forEach(catKey => {
            const groupItems = sortPantryItems(filtered.filter(i => normalizeCategoryKey(i.category) === catKey));
            if (groupItems.length === 0) return;

            const header = document.createElement('div');
            header.className = 'dept-header';
            header.innerHTML = `<span>${categoryLabels[catKey] || catKey}</span><span>${groupItems.length}</span>`;
            listContainer.appendChild(header);

            groupItems.forEach(item => listContainer.appendChild(createPantryCardElement(item)));
        });
    } else if (groupMode === 'LOCATION' && selectedLoc === 'ALLE') {
        const knownLocs = new Set(pantryLocationOrder);
        const extraLocs = [...new Set(filtered.map(i => i.location || 'Vorratsschrank'))].filter(l => !knownLocs.has(l));
        [...pantryLocationOrder, ...extraLocs].forEach(locKey => {
            const groupItems = sortPantryItems(filtered.filter(i => (i.location || 'Vorratsschrank') === locKey));
            if (groupItems.length === 0) return;

            const header = document.createElement('div');
            header.className = 'dept-header';
            header.innerHTML = `<span>${locationLabels[locKey] || `📍 ${locKey}`}</span><span>${groupItems.length}</span>`;
            listContainer.appendChild(header);

            groupItems.forEach(item => listContainer.appendChild(createPantryCardElement(item)));
        });
    } else {
        sortPantryItems(filtered).forEach(item => listContainer.appendChild(createPantryCardElement(item)));
    }
}

searchInput.addEventListener('input', renderList);
clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    renderList();
    searchInput.focus();
});
filterCategory.addEventListener('change', renderList);
filterLocation.addEventListener('change', renderList);
groupPantryBy.addEventListener('change', renderList);
// --- PRÄZISE ZUTATEN-ZUORDNUNG (WORTGRENZEN, SINGULAR/PLURAL & EINHEITEN-FILTER) ---
function normalizeIngredientTokens(rawStr) {
    const stopWords = new Set([
        'frisch', 'frische', 'frischer', 'frisches',
        'klein', 'kleine', 'kleiner', 'mittelgroß', 'mittelgroße', 'groß', 'große', 'großer',
        'gehackt', 'gehackte', 'gewürfelt', 'gewürfelte', 'geschnitten', 'geschnittene',
        'gerieben', 'geriebener', 'geriebene', 'fein', 'grob', 'optional', 'nach', 'geschmack', 'bedarf',
        'dose', 'dosen', 'glas', 'gläser', 'packung', 'päckchen', 'bund', 'zehe', 'zehen', 'prise', 'etwas'
    ]);

    const cleaned = (rawStr || '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[,.;:!?/\\\-–—"'„“0-9]/g, ' ')
        .trim();

    return cleaned
        .split(/\s+/)
        .filter(w => w.length >= 2 && !stopWords.has(w))
        .map(w => {
            if (w.length > 4 && w.endsWith('en')) return w.slice(0, -2);
            if (w.length > 4 && w.endsWith('er')) return w.slice(0, -2);
            if (w.length > 3 && w.endsWith('e')) return w.slice(0, -1);
            if (w.length > 3 && w.endsWith('n')) return w.slice(0, -1);
            if (w.length > 4 && w.endsWith('s')) return w.slice(0, -1);
            return w;
        });
}

function classifyIngredientGroup(nameStr) {
    const s = (nameStr || '').toLowerCase().trim();

    if (s.includes('kokosmilch') || s.includes('kokosdrink')) return 'milk_coconut';
    if (s.includes('hafermilch') || s.includes('haferdrink')) return 'milk_oat';
    if (s.includes('sojamilch') || s.includes('sojadrink')) return 'milk_soy';
    if (s.includes('mandelmilch') || s.includes('mandeldrink')) return 'milk_almond';
    if (s.includes('reismilch') || s.includes('reisdrink')) return 'milk_rice';
    if (s.includes('dinkelmilch') || s.includes('dinkeldrink')) return 'milk_spelt';
    if (s.includes('erbsenmilch') || s.includes('erbsendrink')) return 'milk_pea';
    if (s.includes('cashewmilch') || s.includes('cashewdrink')) return 'milk_cashew';
    if (s.includes('kondensmilch')) return 'milk_condensed';
    if (s.includes('buttermilch')) return 'milk_butter';
    if (/\b(kuhmilch|vollmilch|frischmilch|h-milch|weidemilch|fettarme milch|milch)\b/.test(s)) return 'milk_cow';

    if (s.includes('kokosöl') || s.includes('kokosfett')) return 'oil_coconut';
    if (s.includes('olivenöl')) return 'oil_olive';
    if (s.includes('rapsöl')) return 'oil_rapeseed';
    if (s.includes('sonnenblumenöl')) return 'oil_sunflower';
    if (s.includes('sesamöl')) return 'oil_sesame';

    if (s.includes('apfelessig')) return 'vinegar_apple';
    if (s.includes('balsamico')) return 'vinegar_balsamico';
    if (s.includes('weißweinessig') || s.includes('rotweinessig')) return 'vinegar_wine';

    if (s.includes('saure sahne') || s.includes('sauerrahm')) return 'cream_sour';
    if (!s.includes('kochsalz') && /\bsahne\b/.test(s)) return 'cream_sweet';

    if (s.includes('puderzucker')) return 'sugar_powder';
    if (s.includes('vanillezucker') || s.includes('vanillinzucker')) return 'sugar_vanilla';
    if (s.includes('brauner zucker') || s.includes('rohrzucker')) return 'sugar_brown';
    if (/\bzucker\b/.test(s)) return 'sugar_white';

    if (s.includes('paniermehl') || s.includes('semmelbrösel')) return 'breadcrumbs';
    if (s.includes('dinkelmehl')) return 'flour_spelt';
    if (s.includes('vollkornmehl')) return 'flour_whole';
    if (s.includes('kartoffelmehl') || s.includes('maisstärke') || s.includes('speisestärke')) return 'starch';
    if (/\b(weizenmehl|mehl)\b/.test(s)) return 'flour_wheat';

    if (s.includes('kräutersalz')) return 'salt_herb';
    if (/\b(salz|meersalz|jodsalz|steinsalz|speisesalz)\b/.test(s)) return 'salt_regular';

    if (/\b(ei|eier|eigelb|eiweiß)\b/.test(s)) return 'egg';
    if (/\b(reis|basmati|jasminreis|risotto|wildreis|langkornreis|milchreis)\b/.test(s)) return 'rice';

    if (s.includes('frühlingszwiebel') || s.includes('lauchzwiebel')) return 'onion_spring';
    if (s.includes('rote zwiebel')) return 'onion_red';
    if (/\bzwiebel/.test(s)) return 'onion_regular';

    if (s.includes('passierte tomaten') || s.includes('gehackte tomaten') || s.includes('dosentomaten') || s.includes('geschälte tomaten')) return 'tomato_canned';
    if (s.includes('tomatenmark')) return 'tomato_paste';
    if (/\btomate/.test(s)) return 'tomato_fresh';

    return null;
}

function findMatchingPantryItems(ingredientName) {
    const reqName = (ingredientName || '').toLowerCase().trim();
    if (!reqName) return [];

    const reqGroup = classifyIngredientGroup(reqName);
    const reqTokens = normalizeIngredientTokens(reqName);

    const matches = inventory.filter(item => {
        const itemName = (item.name || '').toLowerCase().trim();
        if (!itemName) return false;

        const itemGroup = classifyIngredientGroup(itemName);
        if (reqGroup !== null || itemGroup !== null) {
            return reqGroup !== null && reqGroup === itemGroup;
        }

        if (itemName === reqName) return true;

        const itemTokens = normalizeIngredientTokens(itemName);
        if (reqTokens.length === 0 || itemTokens.length === 0) return false;

        // Alle Kern-Tokens der Rezeptzutat müssen als echte Wörter im Vorratsartikel vorkommen
        return reqTokens.every(rt => itemTokens.includes(rt));
    });

    return matches.sort((a, b) => {
        if (a.isOpened && !b.isOpened) return -1;
        if (!a.isOpened && b.isOpened) return 1;
        if (!a.mhd) return 1;
        if (!b.mhd) return -1;
        return new Date(a.mhd) - new Date(b.mhd);
    });
}

// --- WOCHENPLAN-GENERATOR ---
const togglePlannerBtn = document.getElementById('togglePlannerBtn');
const plannerBox = document.getElementById('plannerBox');
const dayNames = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

togglePlannerBtn.addEventListener('click', () => {
    plannerBox.classList.remove('hidden');
    togglePlannerBtn.classList.add('hidden');
});

document.getElementById('closePlannerBtn').addEventListener('click', () => {
    plannerBox.classList.add('hidden');
    togglePlannerBtn.classList.remove('hidden');
});

document.querySelectorAll('#plannerFocusChips .focus-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
});

function getActiveFocusModes() {
    return Array.from(document.querySelectorAll('#plannerFocusChips .focus-chip.active')).map(c => c.dataset.focus);
}

function isMainMealRecipe(rec) {
    const cat = rec.category || 'Hauptgericht';
    if (!['Hauptgericht', 'SuppenEintoepfe'].includes(cat)) return false;
    const info = analyzeRecipeCharacteristics(rec);
    return !info.isBaking;
}

function scoreRecipeForDay(rec, dayIndex, activeFocuses, alreadyChosenIds, chosenRecipes) {
    if (alreadyChosenIds.has(rec.id)) return -99999;
    if (!isMainMealRecipe(rec)) return -99999;

    const info = analyzeRecipeCharacteristics(rec);
    const targetServings = parseFloat(document.getElementById('planServings').value) || 2.5;
    const baseServings = rec.servings || 4;
    const factor = targetServings / baseServings;
    const scaledIngs = (rec.ingredients || []).map(ing => ({
        ...ing,
        amount: ing.amount ? ing.amount * factor : null
    }));

    let score = 50;

    let readyCount = 0;
    let urgentMhdBonus = 0;
    scaledIngs.forEach(ing => {
        const check = checkIngredientStock(ing);
        if (check.status === 'ok') readyCount++;
        const matches = findMatchingPantryItems(ing.name);
        matches.forEach(m => {
            const mhd = getMhdInfo(m.mhd);
            if (mhd.diffDays <= 7) urgentMhdBonus += 18;
            else if (mhd.diffDays <= 14) urgentMhdBonus += 8;
            if (m.isOpened) urgentMhdBonus += 10;
        });
    });

    const pantryRatio = scaledIngs.length > 0 ? readyCount / scaledIngs.length : 0;
    const pantryWeight = activeFocuses.includes('PANTRY') ? 55 : 22;
    score += pantryRatio * pantryWeight + urgentMhdBonus;

    if (activeFocuses.includes('KID')) {
        score += info.isKidFriendly ? 35 : -45;
    }
    if (activeFocuses.includes('VEGGIE')) {
        score += info.isVeggie ? 40 : -80;
    }
    if (activeFocuses.includes('QUICK_WEEK')) {
        const isWeekend = dayIndex >= 5;
        if (!isWeekend) {
            score += info.isQuick ? 30 : -15;
        } else {
            score += !info.isQuick ? 15 : 5;
        }
    }
    if (activeFocuses.includes('LIGHT')) {
        if (info.isLight) score += 30;
        else if (info.nut.perServing.kcal > 700) score -= 25;
    }
    if (activeFocuses.includes('PROTEIN')) {
        score += info.isHighProtein ? 30 : (info.nut.perServing.p * 0.6);
    }
    if (activeFocuses.includes('LOW_CARB')) {
        score += info.isLowCarb ? 35 : -(info.nut.perServing.c * 0.4);
    }
    if (activeFocuses.includes('MEAL_PREP')) {
        score += info.isMealPrep ? 35 : -5;
    }
    if (activeFocuses.includes('BUDGET')) {
        score += info.isBudget ? 28 : -5;
    }

    if (chosenRecipes.length > 0) {
        const prev = chosenRecipes[chosenRecipes.length - 1];
        const prevInfo = analyzeRecipeCharacteristics(prev);

        if (!info.isVeggie && !prevInfo.isVeggie) score -= 18;
        if (info.nut.perServing.kcal > 650 && prevInfo.nut.perServing.kcal > 650) score -= 16;

        const wordsA = new Set((rec.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 4));
        const wordsB = (prev.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 4);
        if (wordsB.some(w => wordsA.has(w))) score -= 25;
    }

    score += Math.random() * 12;
    return score;
}

function generateBalancedWeekPlan() {
    const mealRecipes = recipes.filter(r => isMainMealRecipe(r));
    if (mealRecipes.length === 0) {
        document.getElementById('generatedPlanResult').innerHTML = `
            <div class="empty-state" style="padding:16px; font-size:0.88rem;">
                Ihr habt noch keine Rezepte in „🍽️ Hauptgericht“ oder „🍲 Suppen & Eintöpfe“ gespeichert.
            </div>`;
        return;
    }

    const numDays = parseInt(document.getElementById('planDays').value, 10) || 7;
    const activeFocuses = getActiveFocusModes();
    const chosen = [];
    const chosenIds = new Set();

    for (let d = 0; d < numDays; d++) {
        const candidates = recipes
            .map(r => ({ rec: r, score: scoreRecipeForDay(r, d, activeFocuses, chosenIds, chosen) }))
            .filter(c => c.score > -50000)
            .sort((a, b) => b.score - a.score);

        if (candidates.length === 0) break;
        const pick = candidates[0].rec;
        chosen.push(pick);
        chosenIds.add(pick.id);
    }

    currentProposedPlan = chosen;
    renderProposedPlan();
}

window.rerollSinglePlanDay = function(dayIdx) {
    const activeFocuses = getActiveFocusModes();
    const usedIds = new Set(currentProposedPlan.map(r => r.id));
    const otherRecipes = currentProposedPlan.filter((_, idx) => idx !== dayIdx);

    const candidates = recipes
        .filter(r => !usedIds.has(r.id))
        .map(r => ({ rec: r, score: scoreRecipeForDay(r, dayIdx, activeFocuses, usedIds, otherRecipes) }))
        .filter(c => c.score > -50000)
        .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
        currentProposedPlan[dayIdx] = candidates[0].rec;
        renderProposedPlan();
    } else {
        alert('Keine weiteren alternativen Hauptgerichte in eurer Sammlung verfügbar.');
    }
};

window.applyGeneratedPlanToWeek = async function() {
    if (currentProposedPlan.length === 0) return;
    const targetServings = parseFloat(document.getElementById('planServings').value) || 2.5;

    for (const rec of currentProposedPlan) {
        recipeServingsOverride[rec.id] = targetServings;
        if (!rec.plannedThisWeek) {
            await updateDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "rezepte", rec.id), {
                plannedThisWeek: true
            });
        }
    }

    plannerBox.classList.add('hidden');
    togglePlannerBtn.classList.remove('hidden');
    alert(`✅ ${currentProposedPlan.length} Gerichte für je ${targetServings} Portionen wurden in euren Wochenplan übernommen!`);
};

function renderProposedPlan() {
    const container = document.getElementById('generatedPlanResult');
    if (currentProposedPlan.length === 0) {
        container.innerHTML = '';
        return;
    }

    const targetServings = parseFloat(document.getElementById('planServings').value) || 2.5;
    let kcalSum = 0, kcalDays = 0;

    const rowsHtml = currentProposedPlan.map((rec, idx) => {
        const nut = calculateRecipeNutrition(rec, targetServings);
        if (nut.hasData && nut.perServing.kcal > 0) {
            kcalSum += nut.perServing.kcal;
            kcalDays++;
        }
        const info = analyzeRecipeCharacteristics(rec);
        const badges = [
            info.isKidFriendly ? '👶' : '',
            info.isVegan ? '🌱' : (info.isVeggie ? '🥦' : ''),
            info.isQuick ? '⚡' : '',
            nut.hasData ? `${nut.perServing.kcal} kcal/Port.` : ''
        ].filter(Boolean).join(' • ');

        return `
            <div class="plan-day-row">
                <div>
                    <div style="font-size:0.75rem; font-weight:700; color:#1d4ed8;">${dayNames[idx] || `Tag ${idx + 1}`}</div>
                    <strong style="font-size:0.92rem;">${rec.title}</strong>
                    ${badges ? `<div style="font-size:0.75rem; color:#4b5563;">${badges}</div>` : ''}
                </div>
                <button type="button" class="icon-btn" onclick="rerollSinglePlanDay(${idx})" title="Diesen Tag neu würfeln">🎲</button>
            </div>
        `;
    }).join('');

    const avgKcal = kcalDays > 0 ? Math.round(kcalSum / kcalDays) : 0;

    container.innerHTML = `
        ${avgKcal > 0 ? `<div style="font-size:0.8rem; color:#1e3a8a; font-weight:600; margin-bottom:8px;">📊 Schnitt: ca. ${avgKcal} kcal pro Portion & Hauptmahlzeit (${targetServings} Portionen/Tag)</div>` : ''}
        ${rowsHtml}
        <button type="button" class="add-btn" style="background:var(--success); margin-top:6px;" onclick="applyGeneratedPlanToWeek()">📌 Kompletten Vorschlag in Wochenplan übernehmen</button>
    `;
}

document.getElementById('generatePlanBtn').addEventListener('click', generateBalancedWeekPlan);

// --- REZEPTE: 13 KATEGORIEN, 13 TAGS, PARSER & DOPPLUNGSPRÜFUNG ---
const toggleRecipeFormBtn = document.getElementById('toggleRecipeFormBtn');
const recipeFormCard = document.getElementById('recipeFormCard');
const ingredientRows = document.getElementById('ingredientRows');
const ocrFeedback = document.getElementById('ocrFeedback');
const pasteBoxPanel = document.getElementById('pasteBoxPanel');
const rawRecipePasteInput = document.getElementById('rawRecipePasteInput');

document.querySelectorAll('#recipeTagSelector .tag-toggle').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('selected'));
});

function getSelectedFormTags() {
    return Array.from(document.querySelectorAll('#recipeTagSelector .tag-toggle.selected')).map(b => b.dataset.tag);
}

function setSelectedFormTags(tags = []) {
    document.querySelectorAll('#recipeTagSelector .tag-toggle').forEach(b => {
        b.classList.toggle('selected', tags.includes(b.dataset.tag));
    });
}

function normalizeRecipeTitleForCompare(title) {
    return (title || '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/[^a-zäöüß0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function findDuplicateRecipe(title, ingredients = [], ignoreRecipeId = '') {
    const normTitle = normalizeRecipeTitleForCompare(title);
    if (!normTitle) return null;

    // 1. Exakter oder sehr ähnlicher Titel-Abgleich
    const titleMatch = recipes.find(r => {
        if (ignoreRecipeId && r.id === ignoreRecipeId) return false;
        const existingNorm = normalizeRecipeTitleForCompare(r.title);
        return existingNorm === normTitle || (normTitle.length >= 6 && existingNorm.includes(normTitle)) || (existingNorm.length >= 6 && normTitle.includes(existingNorm));
    });
    if (titleMatch) return { recipe: titleMatch, reason: 'identischer/ähnlicher Titel' };

    // 2. Zutaten-Ähnlichkeits-Abgleich (>= 80% Übereinstimmung ab 4 Zutaten)
    const newIngSet = new Set(ingredients.map(i => (i.name || '').toLowerCase().trim()).filter(Boolean));
    if (newIngSet.size >= 4) {
        const ingMatch = recipes.find(r => {
            if (ignoreRecipeId && r.id === ignoreRecipeId) return false;
            const oldIngs = (r.ingredients || []).map(i => (i.name || '').toLowerCase().trim()).filter(Boolean);
            if (oldIngs.length < 4) return false;
            const shared = oldIngs.filter(x => newIngSet.has(x)).length;
            const ratio = shared / Math.max(newIngSet.size, oldIngs.length);
            return ratio >= 0.8;
        });
        if (ingMatch) return { recipe: ingMatch, reason: 'fast identische Zutatenliste' };
    }

    return null;
}

function detectRecipeCategoryFromText(rawText) {
    const lower = (rawText || '').toLowerCase();

    if (/\b(weihnacht|advent|spekulatius|lebkuchen|zimtstern|stollen|christstollen|glühwein|punsch|nikolaus|vanillekipferl)\b/.test(lower)) return 'WeihnachtenAdvent';
    if (/\b(dessert|nachtisch|süßspeise|pudding|mousse|milchreis|grießbrei|panna cotta|creme brûlée|crème brûlée|tiramisu|rote grütze|grütze|kompott|obstsalat|eiscreme|sorbet|parfait)\b/.test(lower)) return 'DessertsSuessspeisen';
    if (/\b(plätzchen|kekse|keks|butterkeks|makronen|waffeln|zimtschnecken|müsliriegel|kleingebäck|baiser)\b/.test(lower)) return 'PlaetzchenKleingebaeck';
    if (/\b(kuchen|torte|muffin|muffins|cupcake|brownie|käsekuchen|apfelkuchen|blechkuchen|hefezopf|bananenbrot|biskuit|rührkuchen|gebäck)\b/.test(lower)) return 'KuchenGebaeck';
    if (/\b(herbst|kürbis|hokkaido|butternut|spargel|ostern|osterlamm|bärentatzen|bärlauch|erdbeerkuchen|zwetschgenkuchen|federweißer|saison)\b/.test(lower)) return 'HerbstSaison';
    if (/\b(frühstück|brunch|pfannkuchen|pancake|porridge|overnight oats|müsli|rührei|spiegelei|omelett|french toast|armerritter|arme ritter)\b/.test(lower)) return 'FruehstueckBrunch';
    if (/\b(salat|nudelsalat|kartoffelsalat|couscoussalat|bowl|buddha bowl|wrap|wraps|kalte küche|gazpacho)\b/.test(lower)) return 'SalateKalteKueche';
    if (/\b(suppe|eintopf|cremesuppe|gulaschsuppe|kartoffelsuppe|kürbissuppe|linseneintopf|erbseneintopf|chili con carne|chili sin carne)\b/.test(lower)) return 'SuppenEintoepfe';
    if (/\b(beilage|brot|baguette|ciabatta|focaccia|brötchen|kräuterbutter|kartoffelgratin|spätzle|knödel|klöße|kroketten)\b/.test(lower)) return 'BeilagenBrot';
    if (/\b(dip|soße|sauce|pesto|hummus|guacamole|tzatziki|kräuterquark|dressing|aioli|chutney|aufstrich)\b/.test(lower)) return 'DipsSossenPestos';
    if (/\b(party|fingerfood|blätterteigschnecken|pizzaschnecken|quiche|snack|snacks|bällchen|spieße|tapas)\b/.test(lower)) return 'PartyFingerfood';
    if (/\b(getränk|sirup|smoothie|limonade|eistee|cocktail|mocktail|kakao|heißer apfel)\b/.test(lower)) return 'GetraenkeSirup';

    return 'Hauptgericht';
}

function matchTagsFromString(rawTagLine) {
    const found = new Set();
    const lower = (rawTagLine || '').toLowerCase();

    const tagMatchers = [
        { tag: 'Kindgerecht', keys: ['kindgerecht', 'kinder', 'kleinkind', 'familienfreundlich'] },
        { tag: 'Schnell', keys: ['schnell', 'feierabend', 'blitz', '15 min', '20 min'] },
        { tag: 'Vegetarisch', keys: ['vegetarisch', 'veggie', 'fleischlos'] },
        { tag: 'Vegan', keys: ['vegan', 'rein pflanzlich'] },
        { tag: 'Grillen', keys: ['grillen', 'grill', 'bbq', 'barbecue', 'dutch oven'] },
        { tag: 'Einfrierbar', keys: ['einfrierbar', 'einfrieren', 'meal-prep', 'meal prep', 'vorkochen'] },
        { tag: 'Proteinreich', keys: ['proteinreich', 'protein', 'eiweißreich', 'high-protein', 'high protein'] },
        { tag: 'Low-Carb', keys: ['low-carb', 'low carb', 'kohlenhydratarm', 'keto'] },
        { tag: 'Leicht', keys: ['leicht', 'kalorienarm', 'figurbewusst', 'gesund'] },
        { tag: 'One-Pot', keys: ['one-pot', 'one pot', 'ein topf', 'pfannengericht', 'blech'] },
        { tag: 'Backen', keys: ['backen', 'kuchen', 'gebäck', 'muffins', 'brot', 'torte', 'plätzchen'] },
        { tag: 'Festlich', keys: ['festlich', 'gäste', 'feiertag', 'weihnachten', 'ostern'] },
        { tag: 'Resteverwertung', keys: ['resteverwertung', 'reste', 'vorratsküche'] }
    ];

    tagMatchers.forEach(m => {
        if (m.keys.some(k => lower.includes(k))) {
            found.add(m.tag);
        }
    });

    return Array.from(found);
}

function addIngredientInputRow(name = '', amount = '', unit = 'g') {
    const row = document.createElement('div');
    row.className = 'ing-builder-row';
    row.innerHTML = `
        <input type="text" list="pantrySuggestions" class="ing-name" placeholder="Zutat (z.B. Hafermilch, Salz)" value="${name.replace(/"/g, '&quot;')}" required>
        <input type="number" class="ing-amount" placeholder="Menge" value="${amount}" min="0" step="any">
        <select class="ing-unit">
            <option value="Stk." ${unit==='Stk.'?'selected':''}>Stk.</option>
            <option value="g" ${unit==='g'?'selected':''}>g</option>
            <option value="kg" ${unit==='kg'?'selected':''}>kg</option>
            <option value="ml" ${unit==='ml'?'selected':''}>ml</option>
            <option value="l" ${unit==='l'?'selected':''}>l</option>
            <option value="TL" ${unit==='TL'?'selected':''}>TL</option>
            <option value="EL" ${unit==='EL'?'selected':''}>EL</option>
            <option value="Prise" ${unit==='Prise'?'selected':''}>Prise</option>
            <option value="Bund" ${unit==='Bund'?'selected':''}>Bund</option>
            <option value="Zehe" ${unit==='Zehe'?'selected':''}>Zehe</option>
            <option value="Dosen" ${unit==='Dosen'?'selected':''}>Dosen</option>
        </select>
        <button type="button" class="icon-btn" onclick="this.parentElement.remove()" title="Zeile entfernen">✕</button>
    `;
    ingredientRows.appendChild(row);
}

function normalizeUnicodeFractions(str) {
    return str
        .replace(/½/g, '0.5')
        .replace(/¼/g, '0.25')
        .replace(/¾/g, '0.75')
        .replace(/⅓/g, '0.33')
        .replace(/⅔/g, '0.67')
        .replace(/(\d+)\s*\/\s*(\d+)/g, (_, a, b) => {
            const denom = parseFloat(b);
            return denom ? String(Math.round((parseFloat(a) / denom) * 100) / 100) : a;
        });
}

function stripMarkdownFormatting(line) {
    return line
        .replace(/^#+\s*/g, '')
        .replace(/\*\*/g, '')
        .replace(/__/g, '')
        .replace(/^[-*•·▪◦►✓✔]\s*/g, '')
        .replace(/^\*([^*]+)\*/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function mapUnitString(rawUnit) {
    const u = (rawUnit || '').toLowerCase().replace(/\.$/, '');
    if (['g', 'gr', 'gramm'].includes(u)) return 'g';
    if (['kg', 'kilogramm', 'kilo'].includes(u)) return 'kg';
    if (['ml', 'milliliter'].includes(u)) return 'ml';
    if (['l', 'liter'].includes(u)) return 'l';
    if (['tl', 'teelöffel', 'teeloeffel'].includes(u)) return 'TL';
    if (['el', 'esslöffel', 'essloeffel'].includes(u)) return 'EL';
    if (['prise', 'prisen'].includes(u)) return 'Prise';
    if (['bund', 'bunde', 'bündel'].includes(u)) return 'Bund';
    if (['zehe', 'zehen', 'knoblauchzehe', 'knoblauchzehen'].includes(u)) return 'Zehe';
    if (['dose', 'dosen', 'glas', 'gläser', 'glaeser', 'becher', 'packung', 'pck', 'päckchen'].includes(u)) return 'Dosen';
    return 'Stk.';
}

function parseRecipeTextIntoForm(rawText, sourceLabel = 'Text') {
    const rawLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (rawLines.length === 0) return;

    let title = '';
    let explicitCategory = null;
    const parsedIngredients = [];
    const stepLines = [];
    const detectedTags = new Set();
    let section = 'UNKNOWN';

    const unitPattern = 'g|gr|gramm|kg|kilogramm|kilo|ml|milliliter|l|liter|tl|teelöffel|el|esslöffel|prise|prisen|bund|zehe|zehen|dose|dosen|glas|gläser|becher|stk\\.?|stück|packung|pck\\.?|päckchen';
    const ingFrontRegex = new RegExp(`^(?:ca\\.?\\s+|etwa\\s+|gut\\s+|knapp\\s+)?(\\d+(?:[.,]\\d+)?|l|I)\\s*(${unitPattern})?\\s+(.+)$`, 'i');
    const ingBackRegex = new RegExp(`^([A-Za-zÄÖÜäöüß\\s\\-()]+?)[,:]?\\s+(\\d+(?:[.,]\\d+)?)\\s*(${unitPattern})$`, 'i');

    rawLines.forEach((rawLine, idx) => {
        if (/^[-*_]{3,}$/.test(rawLine)) return;

        const hadBullet = /^[-*•·▪◦]\s+/.test(rawLine);
        let cleanLine = stripMarkdownFormatting(normalizeUnicodeFractions(rawLine));
        if (!cleanLine) return;

        const lower = cleanLine.toLowerCase();

        const catOnlyMatch = cleanLine.match(/^(?:kategorie|rezeptart|anlass)\s*[:\-]\s*(.+)$/i);
        if (catOnlyMatch) {
            const val = catOnlyMatch[1];
            const foundCat = detectRecipeCategoryFromText(val);
            if (foundCat !== 'Hauptgericht' || /hauptgericht/i.test(val)) {
                explicitCategory = foundCat;
            }
            matchTagsFromString(val).forEach(t => detectedTags.add(t));
            return;
        }

        const tagLineMatch = cleanLine.match(/^(?:tags?|schlagwörter|labels?)\s*[:\-]\s*(.+)$/i);
        if (tagLineMatch) {
            matchTagsFromString(tagLineMatch[1]).forEach(t => detectedTags.add(t));
            return;
        }

        if (cleanLine.length <= 95 && /[👶⚡🥦🌱🔥🧊💪🌾🥗🍲🧁🥂♻️]/.test(cleanLine) && !ingFrontRegex.test(cleanLine)) {
            const emojiTags = matchTagsFromString(cleanLine);
            if (emojiTags.length > 0) {
                emojiTags.forEach(t => detectedTags.add(t));
                return;
            }
        }

        const servMatch = lower.match(/(?:für|ergibt|portionen:?|personen:?)\s*(\d+(?:[.,]\d+)?)\s*(?:personen|portionen|stück|pers\.?)?/i);
        if (servMatch && cleanLine.length <= 45) {
            document.getElementById('recServings').value = parseFloat(servMatch[1].replace(',', '.')) || 4;
            if (/^(zutaten|einkaufsliste)/i.test(lower)) {
                section = 'INGREDIENTS';
            }
            return;
        }

        if (/^(zubereitung|schritte|anleitung|vorgehen|so geht'?s|zubereitungsschritte)\b/i.test(lower) && cleanLine.length <= 40) {
            section = 'STEPS';
            return;
        }
        if (/^(zutaten|einkaufsliste|du brauchst)\b/i.test(lower) && cleanLine.length <= 45) {
            section = 'INGREDIENTS';
            return;
        }

        if (/^(für\s+(?:den|die|das)|zum\s+(?:garnieren|servieren|bestreuen|braten|backen)|außerdem)\b.*:?$/i.test(cleanLine) && cleanLine.length <= 45) {
            if (section !== 'STEPS') section = 'INGREDIENTS';
            return;
        }

        if (!title && idx <= 2 && section !== 'INGREDIENTS' && section !== 'STEPS' && !hadBullet && cleanLine.length >= 3 && cleanLine.length <= 75 && !ingFrontRegex.test(cleanLine) && !/^\d+[.)]\s/.test(cleanLine)) {
            title = cleanLine.replace(/:$/, '');
            return;
        }

        const numberedStepMatch = cleanLine.match(/^(\d+)[.)]\s+(.+)$/);
        if (numberedStepMatch && (section === 'STEPS' || !hadBullet)) {
            section = 'STEPS';
            stepLines.push(`${numberedStepMatch[1]}. ${numberedStepMatch[2].trim()}`);
            return;
        }

        if (section !== 'STEPS') {
            const matchFront = cleanLine.match(ingFrontRegex);
            if (matchFront && matchFront[3].length >= 2 && matchFront[3].length <= 65) {
                const rawNum = (matchFront[1] === 'l' || matchFront[1] === 'I') ? '1' : matchFront[1];
                let num = parseFloat(rawNum.replace(',', '.'));
                let mappedUnit = mapUnitString(matchFront[2]);
                let ingName = matchFront[3].replace(/^[,.-]\s*/, '').trim();

                const stuckUnitMatch = ingName.match(/^(g|gr|kg|ml|l|tl|el)\s+(.+)$/i);
                if (!matchFront[2] && stuckUnitMatch) {
                    mappedUnit = mapUnitString(stuckUnitMatch[1]);
                    ingName = stuckUnitMatch[2].trim();
                }

                const parenWeightMatch = ingName.match(/\((\d+(?:[.,]\d+)?)\s*(g|ml|kg|l)\)/i);
                if (parenWeightMatch && (mappedUnit === 'Dosen' || mappedUnit === 'Stk.')) {
                    num = parseFloat(parenWeightMatch[1].replace(',', '.'));
                    mappedUnit = mapUnitString(parenWeightMatch[2]);
                    ingName = ingName.replace(parenWeightMatch[0], '').replace(/\s+/g, ' ').trim();
                }

                const cleanIngName = ingName.replace(/\s*\(optional\)/i, '').trim();

                section = 'INGREDIENTS';
                parsedIngredients.push({
                    name: cleanIngName,
                    amount: !isNaN(num) ? num : '',
                    unit: mappedUnit
                });
                return;
            }

            const matchBack = cleanLine.match(ingBackRegex);
            if (matchBack && matchBack[1].length >= 2 && matchBack[1].length <= 50) {
                const num = parseFloat(matchBack[2].replace(',', '.'));
                section = 'INGREDIENTS';
                parsedIngredients.push({
                    name: matchBack[1].trim(),
                    amount: !isNaN(num) ? num : '',
                    unit: mapUnitString(matchBack[3])
                });
                return;
            }

            if (section === 'INGREDIENTS' && cleanLine.length <= 45 && !/[.!?]$/.test(cleanLine)) {
                const cleanedNoAmt = cleanLine.replace(/^(etwas|nach bedarf|nach geschmack|eine prise)\s+/i, '').trim();
                const defaultUnit = /^eine prise/i.test(cleanLine) ? 'Prise' : 'Stk.';
                parsedIngredients.push({
                    name: cleanedNoAmt,
                    amount: '',
                    unit: defaultUnit
                });
                return;
            }
        }

        if (cleanLine.length >= 6) {
            stepLines.push(cleanLine);
        }
    });

    if (title) {
        document.getElementById('recTitle').value = title;
    }

    const finalCategory = explicitCategory || detectRecipeCategoryFromText(`${title} ${rawText}`);
    document.getElementById('recCategory').value = finalCategory;

    if (parsedIngredients.length > 0) {
        ingredientRows.innerHTML = '';
        parsedIngredients.forEach(ing => addIngredientInputRow(ing.name, ing.amount, ing.unit));
    }

    if (stepLines.length > 0) {
        document.getElementById('recNotes').value = stepLines.join('\n');
    }

    // Auto-Tagging für alle 13 Tags ergänzen
    const pseudoRec = {
        title: title || document.getElementById('recTitle').value,
        category: finalCategory,
        servings: parseFloat(document.getElementById('recServings').value) || 4,
        ingredients: parsedIngredients.map(i => ({ ...i, amount: i.amount ? parseFloat(i.amount) : null })),
        notes: stepLines.join('\n'),
        tags: Array.from(detectedTags)
    };
    const autoInfo = analyzeRecipeCharacteristics(pseudoRec);
    if (autoInfo.isBaking) detectedTags.add('Backen');
    if (autoInfo.isVeggie) detectedTags.add('Vegetarisch');
    if (autoInfo.isVegan) detectedTags.add('Vegan');
    if (autoInfo.isKidFriendly) detectedTags.add('Kindgerecht');
    if (autoInfo.isQuick) detectedTags.add('Schnell');
    if (autoInfo.isGrill) detectedTags.add('Grillen');
    if (autoInfo.isMealPrep) detectedTags.add('Einfrierbar');
    if (autoInfo.isOnePot) detectedTags.add('One-Pot');
    if (autoInfo.isHighProtein) detectedTags.add('Proteinreich');
    if (autoInfo.isLight) detectedTags.add('Leicht');
    if (autoInfo.isLowCarb) detectedTags.add('Low-Carb');
    if (autoInfo.isFestive) detectedTags.add('Festlich');
    if (autoInfo.isLeftover) detectedTags.add('Resteverwertung');

    const finalTags = Array.from(detectedTags);
    setSelectedFormTags(finalTags);

    // Dopplungshinweis schon direkt nach dem Import anzeigen
    const dupCheck = findDuplicateRecipe(title, parsedIngredients, document.getElementById('editRecipeId').value);
    const dupWarnText = dupCheck ? ` • ⚠️ Hinweis: Rezept „${dupCheck.recipe.title}“ existiert bereits (${dupCheck.reason})!` : '';

    const catLabel = recipeCategoryLabels[finalCategory] || finalCategory;
    const tagSummary = finalTags.length > 0 ? ` • Tags: ${finalTags.join(', ')}` : '';
    ocrFeedback.style.display = 'block';
    ocrFeedback.style.color = dupCheck ? 'var(--warning)' : 'var(--success)';
    ocrFeedback.textContent = `✅ ${sourceLabel} erkannt: ${parsedIngredients.length} Zutaten, ${stepLines.length} Schritte • Kategorie: ${catLabel}${tagSummary}${dupWarnText}`;
}

// --- PDF-TEXTEXTRAKTION ---
async function extractTextFromPdfFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        const rowsMap = new Map();
        textContent.items.forEach(item => {
            if (!item.str || !item.str.trim()) return;
            const y = Math.round(item.transform[5] / 4) * 4;
            if (!rowsMap.has(y)) rowsMap.set(y, []);
            rowsMap.get(y).push({ x: item.transform[4], str: item.str });
        });

        const sortedYs = Array.from(rowsMap.keys()).sort((a, b) => b - a);
        sortedYs.forEach(y => {
            const lineItems = rowsMap.get(y).sort((a, b) => a.x - b.x);
            const lineText = lineItems.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
            if (lineText) fullText += lineText + '\n';
        });
    }

    return fullText.trim();
}

async function preprocessImageForOcr(file) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const scale = img.width < 1200 ? 2 : 1.5;
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.filter = 'grayscale(100%) contrast(140%)';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(file);
        };
        img.src = url;
    });
}

const pdfImgFileInput = document.getElementById('pdfImgFileInput');
document.getElementById('importPdfImgBtn').addEventListener('click', () => pdfImgFileInput.click());

pdfImgFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    ocrFeedback.style.display = 'block';
    ocrFeedback.style.color = 'var(--primary)';

    try {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            ocrFeedback.textContent = '⏳ Lese Rezept-PDF aus...';
            const pdfText = await extractTextFromPdfFile(file);
            if (pdfText && pdfText.length > 15) {
                parseRecipeTextIntoForm(pdfText, 'PDF');
            } else {
                ocrFeedback.style.color = 'var(--danger)';
                ocrFeedback.textContent = '⚠️ Dieses PDF enthält nur ein eingescanntes Bild ohne Textebene. Mach davon kurz einen Screenshot und wähle ihn hier aus!';
            }
        } else {
            ocrFeedback.textContent = '⏳ Optimiere Screenshot & lese Rezepttext aus (ca. 5 Sek.)...';
            const processedCanvas = await preprocessImageForOcr(file);
            const result = await Tesseract.recognize(processedCanvas, 'deu');
            parseRecipeTextIntoForm(result.data.text || '', 'Screenshot');
        }
    } catch (err) {
        ocrFeedback.style.color = 'var(--danger)';
        ocrFeedback.textContent = '❌ Datei konnte nicht gelesen werden. Bitte prüfe das Format (PDF, PNG, JPG).';
    }
    pdfImgFileInput.value = '';
});

document.getElementById('pasteRecipeBtn').addEventListener('click', async () => {
    try {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim().length > 10) {
            parseRecipeTextIntoForm(clipText, 'Zwischenablage');
            return;
        }
    } catch (err) {}

    pasteBoxPanel.classList.remove('hidden');
    rawRecipePasteInput.value = '';
    rawRecipePasteInput.focus();
});

document.getElementById('applyPastedTextBtn').addEventListener('click', () => {
    const txt = rawRecipePasteInput.value.trim();
    if (!txt) {
        alert('Bitte füge zuerst den Rezepttext in das Feld ein.');
        return;
    }
    parseRecipeTextIntoForm(txt, 'Rezepttext');
    pasteBoxPanel.classList.add('hidden');
    rawRecipePasteInput.value = '';
});

document.getElementById('closePasteBoxBtn').addEventListener('click', () => {
    pasteBoxPanel.classList.add('hidden');
    rawRecipePasteInput.value = '';
});

const ocrFileInput = document.getElementById('ocrFileInput');
document.getElementById('ocrPhotoBtn').addEventListener('click', () => ocrFileInput.click());

ocrFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    ocrFeedback.style.display = 'block';
    ocrFeedback.style.color = 'var(--primary)';
    ocrFeedback.textContent = '⏳ Lese Rezepttext vom Foto aus (ca. 5–8 Sekunden)...';

    try {
        const processedCanvas = await preprocessImageForOcr(file);
        const result = await Tesseract.recognize(processedCanvas, 'deu');
        parseRecipeTextIntoForm(result.data.text || '', 'Foto');
    } catch (err) {
        ocrFeedback.style.color = 'var(--danger)';
        ocrFeedback.textContent = '❌ Texterkennung fehlgeschlagen. Tipp: Mache einen Screenshot und nutze „PDF oder Screenshot importieren“.';
    }
    ocrFileInput.value = '';
});

function resetRecipeFormFieldsOnly() {
    document.getElementById('recipeForm').reset();
    document.getElementById('editRecipeId').value = '';
    document.getElementById('recCategory').value = 'Hauptgericht';
    document.getElementById('recServings').value = 4;
    setSelectedFormTags([]);
    document.getElementById('recipeFormTitle').textContent = 'Neues Rezept anlegen';
    document.getElementById('saveRecipeBtn').textContent = '💾 Rezept speichern';
    document.getElementById('saveAndNextRecipeBtn').classList.remove('hidden');
    ingredientRows.innerHTML = '';
    addIngredientInputRow('', '', 'g');
    addIngredientInputRow('', '', 'EL');
}

toggleRecipeFormBtn.addEventListener('click', () => {
    recipeFormCard.classList.remove('hidden');
    toggleRecipeFormBtn.classList.add('hidden');
    pasteBoxPanel.classList.add('hidden');
    ocrFeedback.style.display = 'none';
    resetRecipeFormFieldsOnly();
});

document.getElementById('closeRecipeFormBtn').addEventListener('click', () => {
    recipeFormCard.classList.add('hidden');
    toggleRecipeFormBtn.classList.remove('hidden');
    pasteBoxPanel.classList.add('hidden');
    document.getElementById('recipeForm').reset();
    document.getElementById('editRecipeId').value = '';
    setSelectedFormTags([]);
    ocrFeedback.style.display = 'none';
    ingredientRows.innerHTML = '';
});

document.getElementById('addIngRowBtn').addEventListener('click', () => addIngredientInputRow('', '', 'TL'));

// --- REZEPT SPEICHERN INKL. DOPPLUNGSPRÜFUNG ---
async function saveRecipeEntry(keepOpenForNext = false) {
    let editId = document.getElementById('editRecipeId').value;
    const title = document.getElementById('recTitle').value.trim();
    const category = document.getElementById('recCategory').value || 'Hauptgericht';
    const servings = parseFloat(document.getElementById('recServings').value) || 4;
    const tags = getSelectedFormTags();
    const notes = document.getElementById('recNotes').value.trim();
    const rows = ingredientRows.querySelectorAll('.ing-builder-row');
    const ingredients = [];

    if (!title) {
        alert('Bitte einen Rezeptnamen eingeben.');
        document.getElementById('recTitle').focus();
        return;
    }

    rows.forEach(r => {
        const n = r.querySelector('.ing-name').value.trim();
        const a = parseFloat(r.querySelector('.ing-amount').value);
        const u = r.querySelector('.ing-unit').value;
        if (n) {
            ingredients.push({
                name: n,
                amount: !isNaN(a) && a > 0 ? a : null,
                unit: u
            });
        }
    });

    if (ingredients.length === 0) {
        alert('Bitte mindestens eine Zutat eintragen.');
        return;
    }

    // Dopplungsprüfung vor dem Speichern (wenn neu angelegt wird)
    if (!editId) {
        const dup = findDuplicateRecipe(title, ingredients);
        if (dup) {
            const actionChoice = prompt(
                `⚠️ Ähnliches Rezept bereits vorhanden: „${dup.recipe.title}“ (${dup.reason}).\n\n` +
                `Bitte wähle eine Option (Zahl eingeben):\n` +
                `1 = Bestehendes Rezept überschreiben / aktualisieren\n` +
                `2 = Trotzdem als neues Rezept speichern\n` +
                `3 = Abbrechen`,
                '1'
            );
            if (!actionChoice || actionChoice.trim() === '3') {
                return;
            }
            if (actionChoice.trim() === '1') {
                editId = dup.recipe.id;
            }
        }
    }

    if (editId) {
        await updateDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "rezepte", editId), { title, category, servings, tags, notes, ingredients });
    } else {
        await addDoc(rezepteRef, { title, category, servings, tags, notes, ingredients, plannedThisWeek: false, lastCooked: null });
    }

    fetchAndLearnMissingNutrition(ingredients);

    if (keepOpenForNext) {
        resetRecipeFormFieldsOnly();
        pasteBoxPanel.classList.remove('hidden');
        rawRecipePasteInput.value = '';
        ocrFeedback.style.display = 'block';
        ocrFeedback.style.color = 'var(--success)';
        ocrFeedback.textContent = `✅ "${title}" gespeichert – füge direkt das nächste Rezept ein!`;
        rawRecipePasteInput.focus();
    } else {
        document.getElementById('closeRecipeFormBtn').click();
    }
}

document.getElementById('recipeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveRecipeEntry(false);
});

document.getElementById('saveAndNextRecipeBtn').addEventListener('click', async () => {
    await saveRecipeEntry(true);
});

window.editRecipe = function(id) {
    const rec = recipes.find(r => r.id === id);
    if (!rec) return;

    recipeFormCard.classList.remove('hidden');
    toggleRecipeFormBtn.classList.add('hidden');
    pasteBoxPanel.classList.add('hidden');
    ocrFeedback.style.display = 'none';
    document.getElementById('saveAndNextRecipeBtn').classList.add('hidden');

    document.getElementById('editRecipeId').value = rec.id;
    document.getElementById('recTitle').value = rec.title;
    document.getElementById('recCategory').value = rec.category || 'Hauptgericht';
    document.getElementById('recServings').value = rec.servings || 4;
    setSelectedFormTags(rec.tags || []);
    document.getElementById('recNotes').value = rec.notes || '';
    document.getElementById('recipeFormTitle').textContent = '✏️ Rezept bearbeiten';
    document.getElementById('saveRecipeBtn').textContent = '💾 Änderungen speichern';

    ingredientRows.innerHTML = '';
    (rec.ingredients || []).forEach(ing => addIngredientInputRow(ing.name, ing.amount || '', ing.unit || 'Stk.'));
    recipeFormCard.scrollIntoView({ behavior: 'smooth' });
};

window.deleteRecipe = async function(id) {
    if (confirm('Dieses Rezept wirklich löschen?')) {
        await deleteDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "rezepte", id));
    }
};

window.toggleWeekPlan = async function(id) {
    const rec = recipes.find(r => r.id === id);
    if (!rec) return;
    await updateDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "rezepte", id), {
        plannedThisWeek: !rec.plannedThisWeek
    });
};

window.changeRecipeServings = function(id, delta) {
    const rec = recipes.find(r => r.id === id);
    if (!rec) return;
    const baseServings = rec.servings || 4;
    const current = recipeServingsOverride[id] || baseServings;
    const next = Math.max(0.5, Math.min(40, Math.round((current + delta) * 10) / 10));
    recipeServingsOverride[id] = next;
    renderRecipes();
};

function getScaledIngredients(rec) {
    const baseServings = rec.servings || 4;
    const targetServings = recipeServingsOverride[rec.id] || baseServings;
    const factor = targetServings / baseServings;

    return (rec.ingredients || []).map(ing => {
        if (!ing.amount) return { ...ing };
        const scaled = Math.round(ing.amount * factor * 100) / 100;
        return { ...ing, amount: scaled };
    });
}

window.addAllWeekMissingToShopping = async function() {
    const planned = recipes.filter(r => r.plannedThisWeek);
    if (planned.length === 0) return;

    let addedCount = 0;
    for (const rec of planned) {
        const scaledIngs = getScaledIngredients(rec);
        for (const ing of scaledIngs) {
            const check = checkIngredientStock(ing);
            if (check.status !== 'ok') {
                const note = ing.amount ? `Für ${rec.title} (${ing.amount} ${ing.unit})` : `Für ${rec.title}`;
                const detectedCat = normalizeCategoryKey(detectCategoryAndLocation(ing.name).category);
                const existing = shoppingItems.find(s => s.name.trim().toLowerCase() === ing.name.trim().toLowerCase() && !s.inCart);

                if (existing) {
                    if (!existing.note || !existing.note.includes(rec.title)) {
                        const updatedNote = existing.note ? `${existing.note} + ${note}` : note;
                        await updateDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "einkaufsliste", existing.id), {
                            note: updatedNote
                        });
                        addedCount++;
                    }
                } else {
                    await addDoc(einkaufRef, {
                        name: ing.name.trim(),
                        note: note,
                        category: detectedCat,
                        location: 'Vorratsschrank',
                        unit: 'Stk.',
                        inCart: false
                    });
                    addedCount++;
                }
            }
        }
    }

    if (addedCount > 0) {
        alert(`🛒 ${addedCount} fehlende Zutaten aus eurem Wochenplan wurden auf die Einkaufsliste gesetzt!`);
    } else {
        alert('✅ Alle Zutaten für euren Wochenplan sind bereits im Vorrat oder schon auf der Einkaufsliste!');
    }
};

function convertRecipeAmountToPantryUnit(recAmount, recUnit, pantryUnit) {
    if (!recAmount) return 1;
    if (recUnit === pantryUnit) return recAmount;

    const isMetricSmall = (u) => u === 'g' || u === 'ml';
    const isMetricLarge = (u) => u === 'kg' || u === 'l';

    if (recUnit === 'kg' && pantryUnit === 'g') return recAmount * 1000;
    if (recUnit === 'g' && pantryUnit === 'kg') return recAmount / 1000;
    if (recUnit === 'l' && pantryUnit === 'ml') return recAmount * 1000;
    if (recUnit === 'ml' && pantryUnit === 'l') return recAmount / 1000;

    if (recUnit === 'TL') {
        if (isMetricSmall(pantryUnit)) return recAmount * 5;
        if (isMetricLarge(pantryUnit)) return (recAmount * 5) / 1000;
        return 0;
    }
    if (recUnit === 'EL') {
        if (isMetricSmall(pantryUnit)) return recAmount * 15;
        if (isMetricLarge(pantryUnit)) return (recAmount * 15) / 1000;
        return 0;
    }
    if (recUnit === 'Prise') {
        if (isMetricSmall(pantryUnit)) return recAmount * 1;
        if (isMetricLarge(pantryUnit)) return (recAmount * 1) / 1000;
        return 0;
    }
    if (['Zehe', 'Bund'].includes(recUnit) && pantryUnit === 'Stk.') {
        return 0;
    }
    return recAmount;
}

window.cookRecipe = async function(id) {
    const rec = recipes.find(r => r.id === id);
    if (!rec) return;

    const activeServings = recipeServingsOverride[rec.id] || rec.servings || 4;
    if (!confirm(`🍳 "${rec.title}" (${activeServings} Portionen) zubereitet?\n\nAlle benötigten Zutaten werden jetzt nach kürzestem MHD vom Vorrat abgezogen und halb verbrauchte Packungen als angebrochen markiert.`)) {
        return;
    }

    const emptyItems = [];
    const scaledIngs = getScaledIngredients(rec);
    const todayIso = new Date().toISOString().slice(0, 10);

    for (const ing of scaledIngs) {
        const matches = findMatchingPantryItems(ing.name);
        if (matches.length === 0) continue;

        let remainingNeededInFirstUnit = convertRecipeAmountToPantryUnit(ing.amount, ing.unit, matches[0].unit);
        if (remainingNeededInFirstUnit <= 0) continue;

        for (const match of matches) {
            if (remainingNeededInFirstUnit <= 0) break;

            const neededInMatchUnit = convertRecipeAmountToPantryUnit(ing.amount, ing.unit, match.unit);
            if (neededInMatchUnit <= 0) continue;

            const ratio = remainingNeededInFirstUnit / convertRecipeAmountToPantryUnit(ing.amount, ing.unit, matches[0].unit);
            const actualNeededHere = Math.round(neededInMatchUnit * ratio * 100) / 100;

            const deductedHere = Math.min(match.amount, actualNeededHere);
            logConsumption(match, deductedHere);

            const leftInPack = Math.round((match.amount - deductedHere) * 100) / 100;
            const itemDoc = doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "vorrat", match.id);

            if (leftInPack <= 0) {
                emptyItems.push(match);
                await deleteDoc(itemDoc);
            } else {
                const updatePayload = { amount: leftInPack };
                if (!match.isOpened) {
                    updatePayload.isOpened = true;
                    updatePayload.openedAt = todayIso;
                }
                await updateDoc(itemDoc, updatePayload);
            }

            const coveredFraction = deductedHere / neededInMatchUnit;
            remainingNeededInFirstUnit = Math.max(0, Math.round((remainingNeededInFirstUnit - (convertRecipeAmountToPantryUnit(ing.amount, ing.unit, matches[0].unit) * coveredFraction)) * 100) / 100);
        }
    }

    await updateDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "rezepte", rec.id), {
        lastCooked: todayIso
    });

    if (emptyItems.length > 0) {
        const names = emptyItems.map(i => i.name).join(', ');
        if (confirm(`✅ Vorrat wurde aktualisiert!\n\nFolgende Zutaten sind jetzt leer: ${names}\n\nSollen diese direkt auf die Einkaufsliste gesetzt werden?`)) {
            for (const item of emptyItems) {
                await addDoc(einkaufRef, {
                    name: item.name,
                    note: 'Nachkauf',
                    category: normalizeCategoryKey(item.category),
                    location: item.location || 'Vorratsschrank',
                    unit: item.unit || 'Stk.',
                    inCart: false
                });
            }
        }
    } else {
        alert('✅ Alle Zutaten wurden vom Vorrat abgezogen!');
    }
};

function normalizeQty(amount, unit) {
    if (unit === 'kg') return { qty: amount * 1000, baseUnit: 'mass_vol' };
    if (unit === 'l') return { qty: amount * 1000, baseUnit: 'mass_vol' };
    if (unit === 'g' || unit === 'ml') return { qty: amount, baseUnit: 'mass_vol' };
    if (unit === 'TL') return { qty: amount * 5, baseUnit: 'mass_vol' };
    if (unit === 'EL') return { qty: amount * 15, baseUnit: 'mass_vol' };
    if (unit === 'Prise') return { qty: amount * 1, baseUnit: 'mass_vol' };
    return { qty: amount, baseUnit: unit };
}

function checkIngredientStock(ing) {
    const matches = findMatchingPantryItems(ing.name);

    if (matches.length === 0) {
        return { status: 'missing', icon: '❌', label: 'Nicht im Vorrat' };
    }

    const locSummary = matches.map(m => `${m.amount} ${m.unit} ${m.name} (${m.location || 'Vorratsschrank'})`).join(', ');

    if (!ing.amount || ['TL', 'EL', 'Prise', 'Zehe', 'Bund'].includes(ing.unit)) {
        const hasMassVolMatch = matches.some(m => normalizeQty(m.amount, m.unit).baseUnit === 'mass_vol');
        if (!hasMassVolMatch || ['Zehe', 'Bund'].includes(ing.unit)) {
            return { status: 'ok', icon: '✅', label: `Da: ${locSummary}` };
        }
    }

    const reqNorm = normalizeQty(ing.amount, ing.unit);
    let totalAvail = 0;
    let sameUnit = true;

    matches.forEach(m => {
        const availNorm = normalizeQty(m.amount, m.unit);
        if (availNorm.baseUnit === reqNorm.baseUnit) {
            totalAvail += availNorm.qty;
        } else {
            sameUnit = false;
        }
    });

    if (!sameUnit) {
        return { status: 'ok', icon: '✅', label: `Da: ${locSummary}` };
    }

    if (totalAvail >= reqNorm.qty) {
        return { status: 'ok', icon: '✅', label: `Da: ${locSummary}` };
    } else {
        return { status: 'warn', icon: '⚠️', label: `Zu wenig: ${locSummary}` };
    }
}

function createRecipeCardElement(rec) {
    const scaledIngs = getScaledIngredients(rec);
    const activeServings = recipeServingsOverride[rec.id] || rec.servings || 4;
    const allReady = scaledIngs.length > 0 && scaledIngs.every(i => checkIngredientStock(i).status === 'ok');
    const nut = calculateRecipeNutrition(rec, activeServings);
    const recCat = rec.category || 'Hauptgericht';
    const catBadge = `<span class="badge badge-cat">${recipeCategoryLabels[recCat] || recCat}</span>`;

    const tagsHtml = (rec.tags || []).map(t => `<span class="badge badge-tag">${recipeTagLabels[t] || t}</span>`).join(' ');
    const lastCookedText = rec.lastCooked
        ? `<span class="badge" style="background:#e0e7ff; color:#3730a3;">🗓️ Zuletzt: ${new Date(rec.lastCooked).toLocaleDateString('de-DE')}</span>`
        : '';

    let macroHtml = '';
    if (nut.hasData) {
        macroHtml = `
            <div class="macro-bar" title="Geschätzte Nährwerte pro Portion (Abdeckung: ${nut.coverage}% der Zutaten)">
                <span>🔥 ${nut.perServing.kcal} kcal</span>
                <span>🥩 ${nut.perServing.p}g E</span>
                <span>🌾 ${nut.perServing.c}g KH</span>
                <span>🥑 ${nut.perServing.f}g F</span>
                <span style="color:#64748b; font-weight:500;">/ Portion (${nut.coverage}%)</span>
            </div>
        `;
    }

    let kidHintHtml = '';
    if (nut.hasData && (nut.perServing.salt > 1.2 || nut.perServing.sugar > 12)) {
        const reasons = [];
        if (nut.perServing.salt > 1.2) reasons.push(`höherer Salzgehalt (~${nut.perServing.salt}g/Port.)`);
        if (nut.perServing.sugar > 12) reasons.push(`höherer Zuckergehalt (~${nut.perServing.sugar}g/Port.)`);
        kidHintHtml = `<div class="kid-hint-banner">👶 Kleinkind-Tipp: ${reasons.join(' & ')} – ggf. Kinderportion vor dem Würzen/Süßen abnehmen.</div>`;
    }

    const card = document.createElement('div');
    card.className = `recipe-card ${rec.plannedThisWeek ? 'planned-week' : ''} ${allReady ? 'all-ready' : ''}`;

    let ingHtml = '<ul class="ing-list">';
    scaledIngs.forEach(ing => {
        const check = checkIngredientStock(ing);
        const reqText = ing.amount ? `${ing.amount} ${ing.unit} ` : '';
        const safeIngName = ing.name.replace(/'/g, "\\'");
        const missingNote = ing.amount ? `Für ${rec.title} (${ing.amount} ${ing.unit})` : `Für ${rec.title}`;

        ingHtml += `
            <li class="ing-row ${check.status}">
                <div>
                    <strong>${check.icon} ${reqText}${ing.name}</strong>
                    <div style="font-size:0.78rem; color:#4b5563;">${check.label}</div>
                </div>
                ${check.status !== 'ok' ? `<button type="button" class="mini-shop-btn" onclick="quickAddToShopping('${safeIngName}', null, '${missingNote.replace(/'/g, "\\'")}')">+ Einkauf</button>` : ''}
            </li>
        `;
    });
    ingHtml += '</ul>';

    let stepsHtml = '';
    if (rec.notes) {
        const stepLines = rec.notes.split(/\r?\n/).filter(Boolean);
        stepsHtml = `<div class="steps-box">${stepLines.map(line => `<div class="step-line" onclick="this.classList.toggle('done')">📝 ${line}</div>`).join('')}</div>`;
    }

    card.innerHTML = `
        <div class="recipe-header">
            <div>
                <h3>${rec.title}</h3>
                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
                    ${catBadge}
                    ${allReady ? `<span class="badge badge-ready">✅ Alle Zutaten da</span>` : ''}
                    ${lastCookedText}
                    ${tagsHtml}
                </div>
            </div>
            <button type="button" class="icon-btn ${rec.plannedThisWeek ? 'opened-active' : ''}" onclick="toggleWeekPlan('${rec.id}')" title="Für diese Woche planen">📌</button>
            <button type="button" class="icon-btn" onclick="editRecipe('${rec.id}')" title="Rezept bearbeiten">✏️</button>
            <button type="button" class="icon-btn" onclick="deleteRecipe('${rec.id}')" title="Rezept löschen">🗑️</button>
        </div>
        <div class="servings-bar">
            <span>👥 Portionen / Stück:</span>
            <button type="button" class="serv-btn" onclick="changeRecipeServings('${rec.id}', -0.5)">-</button>
            <span>${activeServings}</span>
            <button type="button" class="serv-btn" onclick="changeRecipeServings('${rec.id}', 0.5)">+</button>
        </div>
        ${macroHtml}
        ${kidHintHtml}
        ${ingHtml}
        ${stepsHtml}
        <button type="button" class="cook-done-btn" onclick="cookRecipe('${rec.id}')">🍳 Rezept zubereitet – Zutaten vom Vorrat abziehen</button>
    `;
    return card;
}

function renderRecipes() {
    const rawRecSearch = recipeSearchInput.value.trim();
    const recSearchTerm = rawRecSearch.toLowerCase();
    const selectedRecCat = filterRecipeCategory.value;
    const groupMode = groupRecipesBy ? groupRecipesBy.value : 'CATEGORY';
    clearRecipeSearchBtn.style.display = rawRecSearch ? 'flex' : 'none';

    const plannedRecipes = recipes.filter(r => r.plannedThisWeek);
    if (plannedRecipes.length > 0) {
        const chips = plannedRecipes.map(r => {
            const s = recipeServingsOverride[r.id] || r.servings || 4;
            return `
                <span class="week-chip">
                    📌 ${r.title} (${s} P.)
                    <span style="cursor:pointer;" onclick="toggleWeekPlan('${r.id}')" title="Aus Wochenplan entfernen">✕</span>
                </span>
            `;
        }).join('');
        weekPlanContainer.innerHTML = `
            <div class="week-plan-box">
                <h3>📅 Euer Wochenspeiseplan (${plannedRecipes.length})</h3>
                <div class="week-chips">${chips}</div>
                <button type="button" class="add-btn" style="padding:9px; font-size:0.86rem;" onclick="addAllWeekMissingToShopping()">🛒 Alle fehlenden Zutaten auf Einkaufsliste</button>
            </div>
        `;
    } else {
        weekPlanContainer.innerHTML = '';
    }

    let filteredRecipes = recipes.filter(rec => {
        const scaledIngs = getScaledIngredients(rec);
        const titleMatch = (rec.title || '').toLowerCase().includes(recSearchTerm);
        const notesMatch = (rec.notes || '').toLowerCase().includes(recSearchTerm);
        const ingMatch = scaledIngs.some(i => (i.name || '').toLowerCase().includes(recSearchTerm));

        if (recSearchTerm && !titleMatch && !notesMatch && !ingMatch) return false;

        const recCat = rec.category || 'Hauptgericht';
        if (selectedRecCat !== 'ALLE' && recCat !== selectedRecCat) return false;

        if (activeRecipeTagFilter) {
            const recTags = rec.tags || [];
            const autoInfo = analyzeRecipeCharacteristics(rec);
            const matchesTag = recTags.includes(activeRecipeTagFilter) ||
                (activeRecipeTagFilter === 'Kindgerecht' && autoInfo.isKidFriendly) ||
                (activeRecipeTagFilter === 'Vegetarisch' && autoInfo.isVeggie) ||
                (activeRecipeTagFilter === 'Vegan' && autoInfo.isVegan) ||
                (activeRecipeTagFilter === 'Backen' && autoInfo.isBaking) ||
                (activeRecipeTagFilter === 'Festlich' && autoInfo.isFestive) ||
                (activeRecipeTagFilter === 'Resteverwertung' && autoInfo.isLeftover);
            if (!matchesTag) return false;
        }

        const allReady = scaledIngs.length > 0 && scaledIngs.every(i => checkIngredientStock(i).status === 'ok');

        if (activeRecipeFilter === 'READY' && !allReady) return false;
        if (activeRecipeFilter === 'WEEK' && !rec.plannedThisWeek) return false;
        if (activeRecipeFilter === 'MISSING' && allReady) return false;

        return true;
    });

    recipesContainer.innerHTML = '';
    if (recipes.length === 0) {
        recipesContainer.innerHTML = '<div class="empty-state">Noch keine eigenen Rezepte gespeichert. Klicke oben auf „➕ Eigenes Rezept speichern“!</div>';
        return;
    }
    if (filteredRecipes.length === 0) {
        recipesContainer.innerHTML = '<div class="empty-state">Keine passenden Rezepte für deine Auswahl gefunden.</div>';
        return;
    }

    const sortByTitle = (arr) => [...arr].sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    if (groupMode === 'CATEGORY' && selectedRecCat === 'ALLE') {
        const catKeys = Object.keys(recipeCategoryLabels);
        catKeys.forEach(catKey => {
            const groupRecs = sortByTitle(filteredRecipes.filter(r => (r.category || 'Hauptgericht') === catKey));
            if (groupRecs.length === 0) return;

            const header = document.createElement('div');
            header.className = 'dept-header';
            header.innerHTML = `<span>${recipeCategoryLabels[catKey]}</span><span>${groupRecs.length}</span>`;
            recipesContainer.appendChild(header);

            groupRecs.forEach(rec => recipesContainer.appendChild(createRecipeCardElement(rec)));
        });
    } else if (groupMode === 'READY') {
        const readyRecs = sortByTitle(filteredRecipes.filter(r => {
            const sIngs = getScaledIngredients(r);
            return sIngs.length > 0 && sIngs.every(i => checkIngredientStock(i).status === 'ok');
        }));
        const missingRecs = sortByTitle(filteredRecipes.filter(r => {
            const sIngs = getScaledIngredients(r);
            return !(sIngs.length > 0 && sIngs.every(i => checkIngredientStock(i).status === 'ok'));
        }));

        if (readyRecs.length > 0) {
            const h1 = document.createElement('div');
            h1.className = 'dept-header';
            h1.style.background = 'rgba(21, 128, 61, 0.9)';
            h1.innerHTML = `<span>✅ Sofort kochbar (alle Zutaten da)</span><span>${readyRecs.length}</span>`;
            recipesContainer.appendChild(h1);
            readyRecs.forEach(rec => recipesContainer.appendChild(createRecipeCardElement(rec)));
        }

        if (missingRecs.length > 0) {
            const h2 = document.createElement('div');
            h2.className = 'dept-header';
            h2.innerHTML = `<span>⚠️ Zutaten fehlen noch</span><span>${missingRecs.length}</span>`;
            recipesContainer.appendChild(h2);
            missingRecs.forEach(rec => recipesContainer.appendChild(createRecipeCardElement(rec)));
        }
    } else {
        sortByTitle(filteredRecipes).forEach(rec => recipesContainer.appendChild(createRecipeCardElement(rec)));
    }
}

recipeSearchInput.addEventListener('input', renderRecipes);
clearRecipeSearchBtn.addEventListener('click', () => {
    recipeSearchInput.value = '';
    renderRecipes();
    recipeSearchInput.focus();
});

document.getElementById('aiRestPromptBtn').addEventListener('click', async () => {
    if (inventory.length === 0) {
        alert('Dein Vorratsschrank ist noch leer!');
        return;
    }
    const sorted = [...inventory].sort((a, b) => {
        if (!a.mhd) return 1;
        if (!b.mhd) return -1;
        return new Date(a.mhd) - new Date(b.mhd);
    });
    const topItems = sorted.slice(0, 10).map(i => `${i.amount} ${i.unit} ${i.name}`).join(', ');
    const promptText = `Erstelle mir einen ausgewogenen, kleinkindgerechten Wochenplan (für 2 Erwachsene + 1 Kleinkind) und nutze dabei bevorzugt diese Vorräte, die bald verbraucht werden sollten: ${topItems}. Gib mir jedes Rezept im Format Titel, Kategorie (z.B. Hauptgericht, Suppen & Eintöpfe), Portionen, passende Tags aus (Kindgerecht, Schnell, Vegetarisch, Vegan, Grillen, Einfrierbar, Proteinreich, Low-Carb, Leicht, One-Pot, Backen, Festlich, Resteverwertung), Zutatenliste mit Mengen und kurze Zubereitungsschritte aus.`;

    try {
        await navigator.clipboard.writeText(promptText);
        alert(`🍳 Wochenplan- & Kochideen-Anfrage in die Zwischenablage kopiert!\n\nDu kannst sie jetzt direkt in Gemini einfügen und die Rezepte anschließend über „📋 Text einfügen“ speichern.`);
    } catch (e) {
        alert(`🍳 Vorräte zum Verkochen:\n\n${topItems}`);
    }
});

// --- SCHWEBENDE BUBBLES: STATISTIK & CSV-BACKUP ---
const statsModal = document.getElementById('statsModal');
const statsYearSelect = document.getElementById('statsYearSelect');
const statsContent = document.getElementById('statsContent');

function renderStatsModal(selectedYear) {
    const data = yearlyStats[selectedYear];
    if (!data || !data.items) {
        statsContent.innerHTML = `<div class="empty-state" style="box-shadow:none;">Für <strong>${selectedYear}</strong> wurden noch keine Verbräuche gezählt. Sobald ihr im Vorrat auf „-“ oder „✅“ tippt oder ein Rezept als zubereitet markiert, füllt sich eure Jahresstatistik automatisch!</div>`;
        return;
    }

    const itemArray = Object.values(data.items).sort((a, b) => b.count - a.count);
    const top10 = itemArray.slice(0, 10);

    let topCatText = '–';
    if (data.categories) {
        const sortedCats = Object.entries(data.categories).sort((a, b) => b[1] - a[1]);
        if (sortedCats.length > 0) {
            topCatText = `${categoryLabels[sortedCats[0][0]] || sortedCats[0][0]} (${sortedCats[0][1]}×)`;
        }
    }

    let html = `
        <div class="stat-highlight">
            <span>Verbrauchte Portionen / Artikel in ${selectedYear}</span>
            <strong>${data.totalActions || 0}×</strong>
            <span style="font-size:0.82rem; color:#4b5563;">Top-Kategorie: ${topCatText}</span>
        </div>
        <h3 style="margin:12px 0 6px 0; font-size:1rem;">🥇 Eure Top-10 Dauerbrenner ${selectedYear}</h3>
    `;

    top10.forEach((entry, idx) => {
        const medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `${idx + 1}.`));
        const roundedTotal = Math.round(entry.totalQty * 10) / 10;
        html += `
            <div class="rank-row">
                <span><strong>${medal} ${entry.name}</strong></span>
                <span>${entry.count}× (${roundedTotal} ${entry.unit})</span>
            </div>
        `;
    });

    statsContent.innerHTML = html;
}

document.getElementById('openStatsBtn').addEventListener('click', () => {
    const currentYear = String(new Date().getFullYear());
    const years = new Set([currentYear, ...Object.keys(yearlyStats)]);
    statsYearSelect.innerHTML = '';
    Array.from(years).sort((a, b) => b - a).forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = `Kalenderjahr ${y}`;
        statsYearSelect.appendChild(opt);
    });
    renderStatsModal(statsYearSelect.value);
    statsModal.classList.remove('hidden');
});

statsYearSelect.addEventListener('change', () => renderStatsModal(statsYearSelect.value));
document.getElementById('closeStatsBtn').addEventListener('click', () => statsModal.classList.add('hidden'));
statsModal.addEventListener('click', (e) => {
    if (e.target === statsModal) statsModal.classList.add('hidden');
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
    if (inventory.length === 0) {
        alert('Keine Daten zum Exportieren vorhanden.');
        return;
    }
    const headers = ['Artikel', 'Menge', 'Einheit', 'Kategorie', 'Lagerort', 'MHD', 'Mindestbestand', 'Angebrochen', 'Eingefroren_am', 'kcal_100g'];
    const rows = inventory.map(i => [
        `"${(i.name || '').replace(/"/g, '""')}"`,
        i.amount,
        `"${i.unit}"`,
        `"${categoryLabels[normalizeCategoryKey(i.category)] || i.category}"`,
        `"${i.location || 'Vorratsschrank'}"`,
        `"${i.mhd || ''}"`,
        i.minAmount || '',
        i.isOpened ? 'Ja' : 'Nein',
        `"${i.frozenAt || ''}"`,
        i.nutrition && i.nutrition.kcal ? i.nutrition.kcal : ''
    ].join(';'));

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Vorratsschrank_Backup_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
});

// --- EINKAUFSLISTE: DAUERBRENNER, IM-WAGEN-MODUS & WHATSAPP-EXPORT ---
function renderStaplesRow() {
    const staplesRow = document.getElementById('staplesRow');
    const currentYear = String(new Date().getFullYear());
    const yearData = yearlyStats[currentYear] || Object.values(yearlyStats)[0];
    if (!yearData || !yearData.items) {
        staplesRow.classList.add('hidden');
        return;
    }

    const topStaples = Object.values(yearData.items)
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

    if (topStaples.length === 0) {
        staplesRow.classList.add('hidden');
        return;
    }

    staplesRow.classList.remove('hidden');
    staplesRow.innerHTML = topStaples.map(s => {
        const safe = s.name.replace(/'/g, "\\'");
        return `<button type="button" class="chip-btn staple" onclick="quickAddToShopping('${safe}')">+ ${s.name}</button>`;
    }).join('');
}

document.getElementById('shareShoppingBtn').addEventListener('click', async () => {
    if (shoppingItems.length === 0) {
        alert('Die Einkaufsliste ist aktuell leer!');
        return;
    }

    let lines = ['🛒 *Unsere Einkaufsliste*\n'];
    supermarketOrder.forEach(catKey => {
        const group = shoppingItems.filter(i => normalizeCategoryKey(i.category) === catKey && !i.inCart);
        if (group.length > 0) {
            lines.push(`*${categoryLabels[catKey] || catKey}*`);
            group.forEach(item => {
                lines.push(`• ${item.name}${item.note ? ` (${item.note})` : ''}`);
            });
            lines.push('');
        }
    });

    const text = lines.join('\n').trim();
    if (navigator.share) {
        try {
            await navigator.share({ title: 'Einkaufsliste', text });
            return;
        } catch (e) {}
    }

    try {
        await navigator.clipboard.writeText(text);
        alert('📋 Einkaufsliste in die Zwischenablage kopiert – du kannst sie jetzt direkt bei WhatsApp einfügen!');
    } catch (e) {
        alert(text);
    }
});

document.getElementById('shoppingForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = document.getElementById('shopName').value.trim();
    const category = normalizeCategoryKey(document.getElementById('shopCategory').value);
    const note = document.getElementById('shopNote').value.trim();
    e.target.reset();
    await addDoc(einkaufRef, { name, note, category, location: 'Vorratsschrank', unit: 'Stk.', inCart: false });
});

window.toggleInCart = async function(id) {
    const item = shoppingItems.find(i => i.id === id);
    if (!item) return;
    await updateDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "einkaufsliste", id), {
        inCart: !item.inCart
    });
};

window.finishShoppingItem = async function(id, moveToPantry) {
    const item = shoppingItems.find(i => i.id === id);
    if (!item) return;

    await deleteDoc(doc(db, "haushalte", SECRET_HOUSEHOLD_ID, "einkaufsliste", id));

    if (moveToPantry) {
        const knownItem = inventory.find(i => i.name.trim().toLowerCase() === item.name.trim().toLowerCase());

        switchTab('VORRAT');
        resetItemFormFieldsOnly();
        formCard.classList.remove('hidden');
        toggleFormBtn.classList.add('hidden');
        document.getElementById('name').value = item.name;

        if (knownItem) {
            document.getElementById('category').value = normalizeCategoryKey(knownItem.category || item.category);
            document.getElementById('location').value = knownItem.location || 'Vorratsschrank';
            document.getElementById('unit').value = knownItem.unit || 'Stk.';
            if (knownItem.minAmount) document.getElementById('minAmount').value = knownItem.minAmount;
            fillNutritionFields(knownItem.nutrition || lookupNutritionPer100g(item.name));
        } else {
            document.getElementById('category').value = normalizeCategoryKey(item.category);
            document.getElementById('location').value = item.location || 'Vorratsschrank';
            document.getElementById('unit').value = item.unit || 'Stk.';
            suggestStorageAndCategory(item.name, '', 'category', 'location', true);
            fillNutritionFields(lookupNutritionPer100g(item.name));
        }

        showFeedback(`🛍️ "${item.name}" eingekauft! Jetzt nur noch Menge/MHD prüfen und speichern.`);
        formCard.scrollIntoView({ behavior: 'smooth' });
    }
};

window.moveNextCartItemToPantry = function() {
    const firstInCart = shoppingItems.find(i => i.inCart);
    if (firstInCart) {
        finishShoppingItem(firstInCart.id, true);
    }
};

function renderShoppingList() {
    renderStaplesRow();
    const inCartItems = shoppingItems.filter(i => i.inCart);
    const inCartBanner = document.getElementById('inCartBanner');

    if (inCartItems.length > 0) {
        inCartBanner.classList.remove('hidden');
        inCartBanner.innerHTML = `
            <span style="font-size:0.88rem; color:#14532d;"><strong>🛍️ ${inCartItems.length} Artikel im Wagen</strong></span>
            <button type="button" class="buy-btn" onclick="moveNextCartItemToPantry()">Nächsten in Vorrat ➔</button>
        `;
    } else {
        inCartBanner.classList.add('hidden');
    }

    shoppingContainer.innerHTML = '';
    if (shoppingItems.length === 0) {
        shoppingContainer.innerHTML = '<div class="empty-state">Die Einkaufsliste ist leer! 🎉</div>';
        return;
    }

    supermarketOrder.forEach(catKey => {
        const groupItems = shoppingItems.filter(i => normalizeCategoryKey(i.category) === catKey && !i.inCart);
        if (groupItems.length === 0) return;

        const deptHeader = document.createElement('div');
        deptHeader.className = 'dept-header';
        deptHeader.innerHTML = `<span>${categoryLabels[catKey] || catKey}</span><span>${groupItems.length}</span>`;
        shoppingContainer.appendChild(deptHeader);

        groupItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'item-card';
            card.innerHTML = `
                <div class="item-info">
                    <h3>${item.name}</h3>
                    ${item.note ? `<div class="item-meta">${item.note}</div>` : ''}
                </div>
                <div class="controls">
                    <button class="cart-toggle-btn" onclick="toggleInCart('${item.id}')" title="Im Supermarkt in den Einkaufswagen legen">🛒 Wagen</button>
                    <button class="buy-btn" onclick="finishShoppingItem('${item.id}', true)" title="Direkt in den Vorrat übernehmen">✓ Vorrat</button>
                    <button class="icon-btn" onclick="finishShoppingItem('${item.id}', false)" title="Löschen">🗑️</button>
                </div>
            `;
            shoppingContainer.appendChild(card);
        });
    });

    if (inCartItems.length > 0) {
        const cartHeader = document.createElement('div');
        cartHeader.className = 'dept-header';
        cartHeader.style.background = 'rgba(21, 128, 61, 0.88)';
        cartHeader.innerHTML = `<span>🛍️ Im Einkaufswagen</span><span>${inCartItems.length}</span>`;
        shoppingContainer.appendChild(cartHeader);

        inCartItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'item-card in-cart';
            card.innerHTML = `
                <div class="item-info">
                    <h3>${item.name}</h3>
                    ${item.note ? `<div class="item-meta">${item.note}</div>` : ''}
                </div>
                <div class="controls">
                    <button class="cart-toggle-btn checked" onclick="toggleInCart('${item.id}')" title="Zurück auf die offene Liste">↩️</button>
                    <button class="buy-btn" onclick="finishShoppingItem('${item.id}', true)" title="In den Vorrat einräumen">✓ In Vorrat</button>
                    <button class="icon-btn" onclick="finishShoppingItem('${item.id}', false)" title="Nur abhaken / löschen">🗑️</button>
                </div>
            `;
            shoppingContainer.appendChild(card);
        });
    }
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
}