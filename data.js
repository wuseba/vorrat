// --- BASIS-NÄHRWERTTABELLE PRO 100G / 100ML + TYPISCHES STÜCKGEWICHT ---
export const BASE_NUTRITION_DB = [
    { keys: ['kokosmilch', 'kokoscreme'], kcal: 195, p: 2.0, c: 3.0, f: 19.0, sugar: 2.5, salt: 0.05, pieceG: 400 },
    { keys: ['hafermilch', 'haferdrink'], kcal: 46, p: 0.8, c: 7.0, f: 1.5, sugar: 4.0, salt: 0.1, pieceG: 1000 },
    { keys: ['sojamilch', 'sojadrink'], kcal: 39, p: 3.3, c: 1.5, f: 1.8, sugar: 1.0, salt: 0.1, pieceG: 1000 },
    { keys: ['mandelmilch', 'mandeldrink'], kcal: 24, p: 0.5, c: 3.0, f: 1.1, sugar: 2.5, salt: 0.1, pieceG: 1000 },
    { keys: ['reismilch', 'reisdrink'], kcal: 52, p: 0.2, c: 10.0, f: 1.0, sugar: 6.5, salt: 0.1, pieceG: 1000 },
    { keys: ['vollmilch', 'kuhmilch', 'frischmilch', 'h-milch', 'milch'], kcal: 64, p: 3.3, c: 4.8, f: 3.5, sugar: 4.8, salt: 0.12, pieceG: 1000 },
    { keys: ['buttermilch'], kcal: 38, p: 3.5, c: 4.0, f: 0.6, sugar: 4.0, salt: 0.13, pieceG: 500 },
    { keys: ['kondensmilch'], kcal: 135, p: 7.0, c: 10.0, f: 7.5, sugar: 10.0, salt: 0.25, pieceG: 340 },
    { keys: ['schlagsahne', 'kochsahne', 'sahne'], kcal: 292, p: 2.4, c: 3.2, f: 30.0, sugar: 3.2, salt: 0.08, pieceG: 200 },
    { keys: ['saure sahne', 'schmand', 'crème fraîche', 'creme fraiche'], kcal: 210, p: 2.8, c: 3.5, f: 20.0, sugar: 3.5, salt: 0.1, pieceG: 200 },
    { keys: ['frischkäse'], kcal: 235, p: 6.0, c: 3.5, f: 22.0, sugar: 3.5, salt: 0.75, pieceG: 200 },
    { keys: ['quark', 'magerquark', 'speisequark'], kcal: 68, p: 12.2, c: 4.1, f: 0.3, sugar: 4.1, salt: 0.1, pieceG: 250 },
    { keys: ['joghurt', 'naturjoghurt', 'skyr', 'griechischer joghurt'], kcal: 62, p: 4.5, c: 4.8, f: 3.5, sugar: 4.8, salt: 0.12, pieceG: 150 },
    { keys: ['mascarpone'], kcal: 394, p: 4.5, c: 3.0, f: 40.0, sugar: 3.0, salt: 0.1, pieceG: 250 },
    { keys: ['ricotta'], kcal: 150, p: 9.0, c: 4.0, f: 11.0, sugar: 4.0, salt: 0.3, pieceG: 250 },
    { keys: ['kräuterbutterbaguette', 'knoblauchbaguette'], kcal: 315, p: 7.5, c: 44.0, f: 11.5, sugar: 2.5, salt: 1.4, pieceG: 175 },
    { keys: ['butter', 'kräuterbutter'], kcal: 741, p: 0.7, c: 0.6, f: 82.0, sugar: 0.6, salt: 0.03, pieceG: 250 },
    { keys: ['margarine'], kcal: 630, p: 0.2, c: 0.5, f: 70.0, sugar: 0.5, salt: 0.3, pieceG: 250 },
    { keys: ['mozzarella'], kcal: 250, p: 18.0, c: 1.5, f: 19.0, sugar: 1.0, salt: 0.7, pieceG: 125 },
    { keys: ['parmesan', 'grana padano', 'hartkäse'], kcal: 392, p: 35.0, c: 0.5, f: 28.0, sugar: 0.5, salt: 1.6, pieceG: 150 },
    { keys: ['gouda', 'emmentaler', 'cheddar', 'käse', 'reibekäse'], kcal: 356, p: 25.0, c: 0.1, f: 28.0, sugar: 0.1, salt: 1.8, pieceG: 200 },
    { keys: ['feta', 'hirtenkäse', 'schafskäse'], kcal: 264, p: 14.0, c: 4.0, f: 21.0, sugar: 4.0, salt: 2.3, pieceG: 200 },
    { keys: ['halloumi', 'grillkäse'], kcal: 315, p: 21.0, c: 2.0, f: 25.0, sugar: 2.0, salt: 2.5, pieceG: 200 },
    { keys: ['ei', 'eier', 'eigelb', 'eiweiß'], kcal: 155, p: 12.6, c: 1.1, f: 10.6, sugar: 1.1, salt: 0.35, pieceG: 60 },
    { keys: ['rinderhack', 'hackfleisch', 'gemischtes hack', 'schweinehack'], kcal: 220, p: 19.0, c: 0.0, f: 16.0, sugar: 0.0, salt: 0.2, pieceG: 500 },
    { keys: ['hähnchen', 'hühnchen', 'putenbrust', 'pute', 'geflügel'], kcal: 115, p: 23.0, c: 0.0, f: 2.0, sugar: 0.0, salt: 0.15, pieceG: 300 },
    { keys: ['schweinefilet', 'schnitzel', 'kotelett', 'schweinefleisch'], kcal: 145, p: 21.0, c: 0.0, f: 6.5, sugar: 0.0, salt: 0.15, pieceG: 250 },
    { keys: ['rindfleisch', 'rindersteak', 'gulasch', 'roulade'], kcal: 165, p: 21.5, c: 0.0, f: 8.5, sugar: 0.0, salt: 0.15, pieceG: 250 },
    { keys: ['bratwurst', 'würstchen', 'wiener', 'bockwurst'], kcal: 285, p: 13.0, c: 1.0, f: 25.0, sugar: 0.5, salt: 2.0, pieceG: 100 },
    { keys: ['schinken', 'kochschinken', 'speck', 'bacon', 'salami'], kcal: 220, p: 19.0, c: 1.0, f: 15.0, sugar: 0.5, salt: 2.8, pieceG: 100 },
    { keys: ['räucherlachs', 'lachsfilet', 'lachs'], kcal: 208, p: 20.0, c: 0.0, f: 13.0, sugar: 0.0, salt: 0.8, pieceG: 250 },
    { keys: ['seelachs', 'kabeljau', 'forelle', 'fischfilet', 'fisch'], kcal: 95, p: 20.0, c: 0.0, f: 1.5, sugar: 0.0, salt: 0.2, pieceG: 250 },
    { keys: ['thunfisch'], kcal: 116, p: 26.0, c: 0.0, f: 1.0, sugar: 0.0, salt: 1.0, pieceG: 150 },
    { keys: ['garnelen', 'scampi', 'krabben'], kcal: 85, p: 18.5, c: 0.5, f: 1.0, sugar: 0.0, salt: 0.9, pieceG: 200 },
    { keys: ['tofu', 'räuchertofu'], kcal: 135, p: 14.0, c: 1.5, f: 8.0, sugar: 0.5, salt: 0.1, pieceG: 200 },
    { keys: ['hummus'], kcal: 240, p: 7.5, c: 15.0, f: 16.0, sugar: 1.0, salt: 1.1, pieceG: 200 },
    { keys: ['nudel', 'pasta', 'spaghetti', 'penne', 'fusilli', 'tagliatelle', 'lasagne', 'makkaroni'], kcal: 355, p: 12.0, c: 71.0, f: 1.5, sugar: 3.0, salt: 0.02, pieceG: 500 },
    { keys: ['tortellini', 'ravioli'], kcal: 280, p: 10.5, c: 43.0, f: 6.5, sugar: 2.5, salt: 1.1, pieceG: 250 },
    { keys: ['gnocchi'], kcal: 165, p: 3.8, c: 35.0, f: 0.6, sugar: 1.0, salt: 1.1, pieceG: 500 },
    { keys: ['schupfnudeln', 'spätzle'], kcal: 185, p: 5.5, c: 33.0, f: 3.0, sugar: 1.5, salt: 0.9, pieceG: 500 },
    { keys: ['reis', 'basmati', 'risotto', 'jasminreis', 'wildreis'], kcal: 350, p: 7.5, c: 77.0, f: 0.8, sugar: 0.3, salt: 0.01, pieceG: 500 },
    { keys: ['süßkartoffel'], kcal: 86, p: 1.6, c: 20.0, f: 0.1, sugar: 4.2, salt: 0.05, pieceG: 220 },
    { keys: ['kartoffel', 'drillingskartoffel', 'festkochend', 'mehligkochend'], kcal: 76, p: 2.0, c: 16.0, f: 0.1, sugar: 0.8, salt: 0.01, pieceG: 100 },
    { keys: ['weizenmehl', 'dinkelmehl', 'vollkornmehl', 'mehl'], kcal: 348, p: 10.5, c: 72.0, f: 1.0, sugar: 0.5, salt: 0.01, pieceG: 1000 },
    { keys: ['speisestärke', 'maisstärke', 'kartoffelmehl'], kcal: 350, p: 0.3, c: 86.0, f: 0.1, sugar: 0.0, salt: 0.02, pieceG: 250 },
    { keys: ['haferflocken', 'schmelzflocken', 'müsli'], kcal: 372, p: 13.5, c: 58.7, f: 7.0, sugar: 0.7, salt: 0.01, pieceG: 500 },
    { keys: ['couscous', 'bulgur', 'quinoa', 'hirse', 'polenta', 'grieß'], kcal: 355, p: 12.0, c: 70.0, f: 1.5, sugar: 1.0, salt: 0.02, pieceG: 500 },
    { keys: ['brot', 'toast', 'brötchen', 'baguette', 'ciabatta'], kcal: 250, p: 8.5, c: 48.0, f: 2.0, sugar: 3.0, salt: 1.2, pieceG: 50 },
    { keys: ['paniermehl', 'semmelbrösel'], kcal: 360, p: 11.0, c: 73.0, f: 2.0, sugar: 4.0, salt: 1.3, pieceG: 250 },
    { keys: ['blätterteig', 'pizzateig', 'flammkuchenteig'], kcal: 370, p: 6.0, c: 38.0, f: 21.0, sugar: 2.0, salt: 1.3, pieceG: 275 },
    { keys: ['wrap', 'tortilla'], kcal: 300, p: 8.0, c: 50.0, f: 7.0, sugar: 3.0, salt: 1.4, pieceG: 60 },
    { keys: ['linsen', 'rote linsen', 'berg-linsen', 'tellerlinsen'], kcal: 330, p: 24.0, c: 52.0, f: 1.5, sugar: 2.0, salt: 0.03, pieceG: 500 },
    { keys: ['kichererbsen', 'kidneybohnen', 'weiße bohnen', 'schwarze bohnen'], kcal: 120, p: 7.5, c: 16.0, f: 2.0, sugar: 1.0, salt: 0.6, pieceG: 240 },
    { keys: ['mais', 'maiskörner', 'zuckermais'], kcal: 86, p: 3.2, c: 19.0, f: 1.2, sugar: 3.2, salt: 0.4, pieceG: 285 },
    { keys: ['erbsen'], kcal: 81, p: 5.4, c: 14.5, f: 0.4, sugar: 5.7, salt: 0.1, pieceG: 250 },
    { keys: ['passierte tomaten', 'gehackte tomaten', 'dosentomaten', 'geschälte tomaten'], kcal: 26, p: 1.3, c: 4.0, f: 0.2, sugar: 3.8, salt: 0.35, pieceG: 400 },
    { keys: ['tomatenmark'], kcal: 82, p: 4.3, c: 14.0, f: 0.5, sugar: 12.0, salt: 1.2, pieceG: 200 },
    { keys: ['apfelmus', 'apfelmark'], kcal: 55, p: 0.3, c: 13.0, f: 0.2, sugar: 11.5, salt: 0.01, pieceG: 350 },
    { keys: ['tomate', 'cherrytomate', 'rispentomate'], kcal: 18, p: 0.9, c: 3.5, f: 0.2, sugar: 2.6, salt: 0.01, pieceG: 110 },
    { keys: ['zwiebel', 'schalotte', 'rote zwiebel'], kcal: 40, p: 1.1, c: 9.0, f: 0.1, sugar: 4.2, salt: 0.01, pieceG: 80 },
    { keys: ['frühlingszwiebel', 'lauchzwiebel', 'lauch', 'porree'], kcal: 31, p: 1.5, c: 5.5, f: 0.3, sugar: 2.5, salt: 0.02, pieceG: 150 },
    { keys: ['knoblauch'], kcal: 149, p: 6.4, c: 33.0, f: 0.5, sugar: 1.0, salt: 0.02, pieceG: 40 },
    { keys: ['karotte', 'möhre', 'wurzel'], kcal: 41, p: 0.9, c: 9.6, f: 0.2, sugar: 4.7, salt: 0.07, pieceG: 80 },
    { keys: ['paprika'], kcal: 31, p: 1.0, c: 6.0, f: 0.3, sugar: 4.2, salt: 0.01, pieceG: 160 },
    { keys: ['zucchini'], kcal: 17, p: 1.2, c: 3.1, f: 0.3, sugar: 2.5, salt: 0.01, pieceG: 200 },
    { keys: ['aubergine'], kcal: 25, p: 1.0, c: 5.9, f: 0.2, sugar: 3.5, salt: 0.01, pieceG: 300 },
    { keys: ['gurke', 'salatgurke'], kcal: 15, p: 0.7, c: 3.6, f: 0.1, sugar: 1.7, salt: 0.01, pieceG: 350 },
    { keys: ['brokkoli'], kcal: 34, p: 2.8, c: 6.6, f: 0.4, sugar: 1.7, salt: 0.03, pieceG: 400 },
    { keys: ['blumenkohl'], kcal: 25, p: 1.9, c: 5.0, f: 0.3, sugar: 1.9, salt: 0.03, pieceG: 600 },
    { keys: ['kohlrabi'], kcal: 27, p: 1.7, c: 6.2, f: 0.1, sugar: 2.6, salt: 0.02, pieceG: 250 },
    { keys: ['sellerie', 'staudensellerie', 'knollensellerie'], kcal: 22, p: 1.2, c: 3.0, f: 0.2, sugar: 1.5, salt: 0.08, pieceG: 250 },
    { keys: ['kürbis', 'hokkaido', 'butternut'], kcal: 45, p: 1.5, c: 9.0, f: 0.3, sugar: 3.5, salt: 0.01, pieceG: 800 },
    { keys: ['rote bete', 'rote beete'], kcal: 43, p: 1.6, c: 9.6, f: 0.2, sugar: 6.8, salt: 0.08, pieceG: 150 },
    { keys: ['spinat', 'blattspinat', 'rahmspinat'], kcal: 23, p: 2.9, c: 3.6, f: 0.4, sugar: 0.4, salt: 0.08, pieceG: 250 },
    { keys: ['salat', 'feldsalat', 'rucola', 'eisbergsalat'], kcal: 16, p: 1.3, c: 2.5, f: 0.2, sugar: 1.2, salt: 0.02, pieceG: 150 },
    { keys: ['champignon', 'pilz', 'pfifferling', 'kräuterseitling'], kcal: 22, p: 3.1, c: 3.3, f: 0.3, sugar: 2.0, salt: 0.01, pieceG: 250 },
    { keys: ['avocado'], kcal: 160, p: 2.0, c: 8.5, f: 14.7, sugar: 0.7, salt: 0.01, pieceG: 150 },
    { keys: ['banane'], kcal: 89, p: 1.1, c: 22.8, f: 0.3, sugar: 12.2, salt: 0.01, pieceG: 120 },
    { keys: ['apfel', 'äpfel'], kcal: 52, p: 0.3, c: 13.8, f: 0.2, sugar: 10.4, salt: 0.01, pieceG: 150 },
    { keys: ['birne'], kcal: 57, p: 0.4, c: 15.2, f: 0.1, sugar: 9.8, salt: 0.01, pieceG: 160 },
    { keys: ['erdbeer', 'himbeer', 'blaubeer', 'heidelbeer', 'brombeer', 'johannisbeer', 'beeren'], kcal: 45, p: 0.8, c: 10.0, f: 0.4, sugar: 7.5, salt: 0.01, pieceG: 250 },
    { keys: ['zitrone', 'limette', 'orange'], kcal: 42, p: 0.8, c: 9.5, f: 0.2, sugar: 7.5, salt: 0.01, pieceG: 100 },
    { keys: ['olivenöl', 'rapsöl', 'sonnenblumenöl', 'kokosöl', 'sesamöl', 'öl'], kcal: 884, p: 0.0, c: 0.0, f: 100.0, sugar: 0.0, salt: 0.0, pieceG: 500 },
    { keys: ['mandel', 'walnuss', 'haselnuss', 'cashew', 'erdnuss', 'pinienkerne', 'nüsse'], kcal: 610, p: 18.0, c: 12.0, f: 54.0, sugar: 4.5, salt: 0.02, pieceG: 100 },
    { keys: ['erdnussbutter', 'mandelmus', 'tahini', 'sesammus'], kcal: 600, p: 22.0, c: 14.0, f: 50.0, sugar: 6.0, salt: 0.5, pieceG: 250 },
    { keys: ['zucker', 'puderzucker', 'brauner zucker', 'rohrzucker', 'vanillezucker'], kcal: 400, p: 0.0, c: 100.0, f: 0.0, sugar: 100.0, salt: 0.0, pieceG: 1000 },
    { keys: ['honig', 'ahornsirup', 'agavendicksaft'], kcal: 304, p: 0.3, c: 82.0, f: 0.0, sugar: 82.0, salt: 0.01, pieceG: 250 },
    { keys: ['schokolade', 'kuvertüre', 'schokodrops'], kcal: 540, p: 6.0, c: 55.0, f: 32.0, sugar: 48.0, salt: 0.1, pieceG: 100 },
    { keys: ['backkakao', 'kakaopulver'], kcal: 350, p: 20.0, c: 15.0, f: 21.0, sugar: 1.0, salt: 0.05, pieceG: 125 },
    { keys: ['chips', 'kartoffelchips', 'flips', 'salzstangen', 'cracker', 'popcorn'], kcal: 510, p: 6.0, c: 53.0, f: 30.0, sugar: 2.0, salt: 1.6, pieceG: 150 },
    { keys: ['kekse', 'keks', 'waffeln', 'gummibärchen', 'fruchtgummi', 'bonbon'], kcal: 420, p: 5.0, c: 72.0, f: 12.0, sugar: 45.0, salt: 0.3, pieceG: 150 },
    { keys: ['salz', 'meersalz', 'kräutersalz'], kcal: 0, p: 0.0, c: 0.0, f: 0.0, sugar: 0.0, salt: 100.0, pieceG: 500 },
    { keys: ['sojasoße', 'sojasauce'], kcal: 53, p: 8.0, c: 4.9, f: 0.1, sugar: 0.4, salt: 14.0, pieceG: 150 },
    { keys: ['pesto'], kcal: 450, p: 5.0, c: 6.0, f: 45.0, sugar: 2.0, salt: 2.8, pieceG: 190 },
    { keys: ['ketchup', 'barbecue', 'grillsoße'], kcal: 112, p: 1.2, c: 25.0, f: 0.2, sugar: 22.0, salt: 1.8, pieceG: 500 },
    { keys: ['senf'], kcal: 110, p: 6.0, c: 6.0, f: 6.5, sugar: 3.0, salt: 4.5, pieceG: 200 },
    { keys: ['mayonnaise', 'remoulade'], kcal: 680, p: 1.2, c: 2.5, f: 74.0, sugar: 2.0, salt: 1.3, pieceG: 250 },
    { keys: ['brühe', 'gemüsebrühe', 'hühnerbrühe'], kcal: 5, p: 0.2, c: 0.8, f: 0.1, sugar: 0.4, salt: 0.9, pieceG: 500 }
];

// --- 11 VORRATS-KATEGORIEN ---
export const categoryLabels = {
    'ObstGemuese': '🥦 Obst & Gemüse',
    'FleischFisch': '🥩 Fleisch & Fisch',
    'Molkerei': '🧀 Molkereiprodukte',
    'Konserven': '🥫 Konserven & Gläser',
    'Trockenwaren': '🍝 Nudeln, Reis & Mehl',
    'Gewürze': '🧂 Gewürze & Soßen',
    'Backen': '🧁 Backzutaten',
    'Getränke': '🧃 Getränke',
    'Suessigkeiten': '🍫 Süßigkeiten',
    'Snacks': '🍿 Snacks & Knabberzeug',
    'SuessigkeitenSnacks': '🍿 Süßigkeiten & Snacks', // Abwärtskompatibilität für alte Einträge
    'Sonstiges': '📦 Sonstiges'
};

export const locationLabels = {
    'Vorratsschrank': '🚪 Vorratsschrank',
    'Kühlschrank': '❄️ Kühlschrank',
    'Gefriertruhe': '🧊 Gefriertruhe',
    'Keller': '🏠 Keller',
    'Obstschale / Küche': '🍎 Obstschale / Küche'
};

export const recipeCategoryLabels = {
    'Hauptgericht': '🍽️ Hauptgericht',
    'DessertsSuessspeisen': '🍮 Desserts & Süßspeisen',
    'KuchenGebaeck': '🍰 Kuchen, Torten & Gebäck',
    'PlaetzchenKleingebaeck': '🍪 Plätzchen & Kleingebäck',
    'WeihnachtenAdvent': '🎄 Weihnachten & Advent',
    'HerbstSaison': '🎃 Herbst & Saison',
    'FruehstueckBrunch': '🥣 Frühstück & Brunch',
    'SalateKalteKueche': '🥗 Salate & Kalte Küche',
    'SuppenEintoepfe': '🍲 Suppen & Eintöpfe',
    'BeilagenBrot': '🥖 Beilagen & Brot',
    'DipsSossenPestos': '🥣 Dips, Soßen & Pestos',
    'PartyFingerfood': '🎉 Party, Fingerfood & Snacks',
    'GetraenkeSirup': '🍹 Getränke & Sirup'
};

// --- 13 REZEPT-TAGS ---
export const recipeTagLabels = {
    'Kindgerecht': '👶 Kindgerecht',
    'Schnell': '⚡ Schnell',
    'Vegetarisch': '🥦 Vegetarisch',
    'Vegan': '🌱 Vegan',
    'Grillen': '🔥 Grillen / BBQ',
    'Einfrierbar': '🧊 Einfrierbar',
    'Proteinreich': '💪 Proteinreich',
    'Low-Carb': '🌾 Low-Carb',
    'Leicht': '🥗 Leicht',
    'One-Pot': '🍲 One-Pot / Ofen',
    'Backen': '🧁 Backen',
    'Festlich': '🥂 Festlich / Gäste',
    'Resteverwertung': '♻️ Resteverwertung'
};

export const supermarketOrder = [
    'ObstGemuese', 'FleischFisch', 'Molkerei', 'Konserven', 'Trockenwaren', 'Gewürze', 'Backen', 'Getränke', 'Suessigkeiten', 'Snacks', 'Sonstiges'
];

export const pantryCategoryOrder = [
    'Molkerei', 'FleischFisch', 'ObstGemuese', 'Konserven', 'Trockenwaren', 'Gewürze', 'Backen', 'Getränke', 'Suessigkeiten', 'Snacks', 'Sonstiges'
];

export const pantryLocationOrder = [
    'Kühlschrank', 'Gefriertruhe', 'Obstschale / Küche', 'Vorratsschrank', 'Keller'
];

export function normalizeCategoryKey(cat) {
    if (cat === 'SuessigkeitenSnacks') return 'Snacks';
    return categoryLabels[cat] ? cat : 'Sonstiges';
}

// --- EMPFOHLENE GEFRIERDAUER BEIM NACHTRÄGLICHEN EINFRIEREN ---
export function getFreezeDurationDays(itemName, category) {
    const lower = (itemName || '').toLowerCase();
    if (/\b(hack|hackfleisch|rinderhack|schweinehack|gemischtes hack|mett|fisch|lachs|garnelen|scampi|muscheln|geflügel|hähnchen|pute)\b/.test(lower)) {
        return { days: 60, reason: 'Hackfleisch / Fisch / Geflügel (~2 Monate)' };
    }
    if (category === 'FleischFisch') {
        return { days: 90, reason: 'Fleisch (~3 Monate)' };
    }
    if (/\b(brot|brötchen|toast|baguette|kuchen|torte|teig|gekocht|suppe|eintopf|soße|bolognese)\b/.test(lower)) {
        return { days: 90, reason: 'Backwaren / Gekochtes (~3 Monate)' };
    }
    return { days: 150, reason: 'Gemüse / Sonstiges (~5 Monate)' };
}

// --- VORRATS-KATEGORIE-, LAGERORT- & MHD-ERKENNUNG ---
export function detectCategoryAndLocation(productName, barcodeTags = '') {
    const nameLower = (productName || '').toLowerCase().trim();
    const cleanTags = (barcodeTags || '')
        .toLowerCase()
        .replace(/plant-based-foods-and-beverages/g, '')
        .replace(/beverages-and-beverages-preparations/g, '');
    const text = `${nameLower} ${cleanTags}`;

    // 1. Pflanzliche Alternativen & Kokosmilch
    if (nameLower.includes('kokosmilch') || nameLower.includes('kokoscreme')) {
        return { category: 'Konserven', location: 'Vorratsschrank', mhdDays: null };
    }
    const plantMilks = ['hafermilch', 'haferdrink', 'sojamilch', 'sojadrink', 'mandelmilch', 'mandeldrink', 'reismilch', 'reisdrink', 'dinkelmilch', 'erbsenmilch', 'cashewmilch'];
    if (plantMilks.some(w => nameLower.includes(w))) {
        return { category: 'Getränke', location: 'Vorratsschrank', mhdDays: null };
    }

    // 2. Tiefkühlware prüfen (vor frischen Regeln!)
    const isFrozenName = /\b(tk|tiefkühl|tiefgekühlt|gefroren|speiseeis|fischstäbchen|pommes|kroketten|blätterteig-tk)\b/.test(nameLower) || nameLower.startsWith('tk ') || nameLower.startsWith('tk-');
    const isFrozenTag = cleanTags.includes('en:frozen-foods') || cleanTags.includes('en:ice-creams');

    const meatFishRegex = /\b(fleisch|hackfleisch|rinderhack|schweinehack|gemischtes hack|hähnchen|hühnchen|pute|putenbrust|schnitzel|steak|rinderfilet|schweinefilet|hähnchenfilet|lachsfilet|fischfilet|gulasch|bratwurst|wurst|aufschnitt|schinken|salami|speck|bacon|fisch|lachs|forelle|kabeljau|seelachs|garnelen|scampi|thunfisch)\b/;
    const isMeatFish = meatFishRegex.test(nameLower) || cleanTags.includes('en:meats') || cleanTags.includes('en:fishes') || cleanTags.includes('en:seafood');

    if (isFrozenName || isFrozenTag) {
        return {
            category: isMeatFish ? 'FleischFisch' : 'Sonstiges',
            location: 'Gefriertruhe',
            mhdDays: 90,
            mhdReason: 'Tiefkühlware'
        };
    }

    // 3. Explizite Kühlschrank-Regel: Kräuterbutterbaguette / Knoblauchbaguette (Kühlregal)
    const chilledBaguetteRegex = /\b(kräuterbutterbaguette|kräuterbaguette|knoblauchbaguette|knoblauchbutterbaguette|kräuterbutter-baguette|knoblauch-baguette)\b/;
    if (chilledBaguetteRegex.test(nameLower)) {
        return {
            category: 'Trockenwaren',
            location: 'Kühlschrank',
            mhdDays: 7,
            mhdReason: 'Kühlregal-Baguette'
        };
    }

    // 4. Explizite Kühlschrank-Regel: Frische Beeren (inkl. Schutz vor Marmelade, Tee, Saft, Joghurt)
    const berryRegex = /\b(erdbeere|erdbeeren|himbeere|himbeeren|blaubeere|blaubeeren|heidelbeere|heidelbeeren|brombeere|brombeeren|johannisbeere|johannisbeeren|waldbeeren|beerenmix)\b/;
    const processedBerryRegex = /\b(marmelade|konfitüre|fruchtaufstrich|saft|nektar|sirup|tee|joghurt|quark|eis|bonbon|keks|schokolade|müsli|getrocknet|gefriergetrocknet)\b/;
    if (berryRegex.test(nameLower) && !processedBerryRegex.test(nameLower)) {
        return {
            category: 'ObstGemuese',
            location: 'Kühlschrank',
            mhdDays: 3,
            mhdReason: 'frische Beeren'
        };
    }

    // 5. Backzutaten
    const bakingRegex = /\b(back family|backzutat|backpulver|natron|vanillin|vanillezucker|vanilleextrakt|trockenhefe|hefe|kuvertüre|schokodrops|backkakao|speisestärke|tortenguss|gelatine|marzipan|puderzucker|kokosraspel|rosinen|sultaninen|pinienkerne|walnuss|walnüsse|haselnuss|haselnüsse|mandeln|mandelblättchen|mandelstifte|haselnusskrokant)\b/;
    const isBakingNutPrep = /(gehackt|gemahlen|gestiftelt|blättchen|hobel|back)/.test(nameLower) && /(nuss|nüsse|mandel|pistazie|cashew)/.test(nameLower);
    if (bakingRegex.test(nameLower) || isBakingNutPrep || cleanTags.includes('en:baking-ingredients')) {
        return {
            category: 'Backen',
            location: nameLower.includes('frische hefe') ? 'Kühlschrank' : 'Vorratsschrank',
            mhdDays: null
        };
    }

    // 6. Getrennte Kategorien: Süßigkeiten (10) vs. Herzhafte Snacks (11)
    const sweetsRegex = /\b(schokolade|schokoriegel|riegel|gummibärchen|fruchtgummi|lakritz|bonbon|bonbons|kekse|keks|butterkeks|waffeln|pralinen|marshmallow|nougat|toffifee|hanuta|kinderriegel|duplo)\b/;
    if (sweetsRegex.test(nameLower) || cleanTags.includes('en:sweet-snacks') || cleanTags.includes('en:chocolates') || cleanTags.includes('en:biscuits')) {
        return {
            category: 'Suessigkeiten',
            location: 'Vorratsschrank',
            mhdDays: null
        };
    }

    const savorySnacksRegex = /\b(chips|kartoffelchips|tortillachips|nachos|flips|erdnussflips|salzstangen|brezeln|cracker|popcorn|studentenfutter|erdnüsse|cashews|cashewkerne|pistazien|macadamia|knabber|snack|snacks|reiswaffeln|maiswaffeln)\b/;
    if (savorySnacksRegex.test(nameLower) || cleanTags.includes('en:snacks') || cleanTags.includes('en:salty-snacks')) {
        return {
            category: 'Snacks',
            location: 'Vorratsschrank',
            mhdDays: null
        };
    }
// --- TÜTENGERICHTE & FIX-PRODUKTE (VOR NUDELN / TOMATEN / FLEISCH PRÜFEN!) ---
    const fixRegex = /\b(maggi\s*fix|knorr\s*fix|fix\s*für|tütensuppe|tütengericht|fertiggericht|5-minuten-terrine|terrine|instant-nudeln|yum\s*yum|asia\s*nudeln|fertigsoße|fertigsauce|bratensoße|rahmsoße|jägersoße|hollandaise\s*tüte|kartoffelpüree\s*pulver)\b/;
    if (fixRegex.test(text)) {
        return {
            category: 'KonservenFertig',
            location: 'Vorratsschrank',
            mhdDays: 365,
            mhdReason: 'Fix-Produkt / Trockenware'
        };
    }
    // 7. Frisches Fleisch & Fisch
    if (isMeatFish) {
        return { category: 'FleischFisch', location: 'Kühlschrank', mhdDays: 2, mhdReason: 'frisches Fleisch/Fisch' };
    }

    // 8. Obst & Gemüse nach Lagerort
    const shortFridgeProduce = [
        'salat', 'feldsalat', 'rucola', 'eisberg', 'spinat', 'spargel',
        'pilz', 'champignon', 'pfifferling', 'erdbeer', 'himbeer', 'blaubeer', 'heidelbeer', 'brombeer', 'johannisbeer', 'frühlingszwiebel'
    ];
    const longFridgeProduce = [
        'brokkoli', 'blumenkohl', 'karotte', 'möhre', 'radieschen', 'kohlrabi', 'lauch', 'porree',
        'sellerie', 'fenchel', 'rosenkohl', 'weißkohl', 'rotkohl', 'kirsche', 'traube', 'weintraube', 'feige'
    ];
    const cellarProduce = [
        'kartoffel', 'süßkartoffel', 'zwiebel', 'schalotte', 'knoblauch',
        'apfel', 'äpfel', 'birne', 'kürbis', 'hokkaido', 'butternut', 'rote bete', 'rübe'
    ];
    const roomProduce = [
        'tomate', 'gurke', 'paprika', 'zucchini', 'aubergine', 'avocado',
        'banane', 'orange', 'mandarine', 'clementine', 'zitrone', 'limette', 'grapefruit',
        'mango', 'ananas', 'melone', 'wassermelone', 'honigmelone',
        'pfirsich', 'nektarine', 'aprikose', 'pflaume', 'zwetschge', 'kiwi', 'ingwer', 'basilikum'
    ];

    const isCannedOrJar = ['passiert', 'geschält', 'gehackt', 'dose', 'glas', 'konserve', 'mus', 'mark', 'pesto', 'soße', 'sauce', 'ketchup', 'en:canned', 'en:jars'].some(w => text.includes(w));

    if (!isCannedOrJar) {
        if (shortFridgeProduce.some(w => nameLower.includes(w))) {
            return { category: 'ObstGemuese', location: 'Kühlschrank', mhdDays: 3, mhdReason: 'empfindliches Frischprodukt' };
        }
        if (longFridgeProduce.some(w => nameLower.includes(w))) {
            return { category: 'ObstGemuese', location: 'Kühlschrank', mhdDays: 7, mhdReason: 'Kühlschrank-Gemüse/-Obst' };
        }
        if (cellarProduce.some(w => nameLower.includes(w))) {
            return { category: 'ObstGemuese', location: 'Keller', mhdDays: 21, mhdReason: 'Lagerobst/-gemüse' };
        }
        if (roomProduce.some(w => nameLower.includes(w))) {
            return { category: 'ObstGemuese', location: 'Obstschale / Küche', mhdDays: 5, mhdReason: 'Zimmertemperatur-Obst/-Gemüse' };
        }
    }

    // 9. Molkerei
    const dairyWords = [
        'milch', 'kuhmilch', 'vollmilch', 'h-milch', 'joghurt', 'käse', 'butter', 'quark', 'sahne', 'frischkäse', 'schmand', 'crème fraîche',
        'mozzarella', 'parmesan', 'gouda', 'emmentaler', 'feta', 'mascarpone', 'ricotta', 'skyr', 'kefir', 'buttermilch',
        'en:dairies', 'en:milks', 'en:cheeses', 'en:yogurts'
    ];
    if (dairyWords.some(w => text.includes(w))) {
        return {
            category: 'Molkerei',
            location: nameLower.includes('h-milch') ? 'Vorratsschrank' : 'Kühlschrank',
            mhdDays: null
        };
    }

    // 10. Konserven & Gläser
    const cannedWords = [
        'passierte tomaten', 'gehackte tomaten', 'tomatenmark', 'maiskörner', 'kidneybohnen', 'kichererbsen',
        'erbsen', 'linsen', 'rotkohl im glas', 'apfelmus', 'marmelade', 'konfitüre', 'honig', 'nutella', 'aufstrich',
        'oliven', 'gewürzgurken', 'cornichons', 'eingelegt', 'suppe', 'eintopf', 'brühe', 'fonds',
        'en:canned', 'en:preserved', 'en:jams', 'en:honeys'
    ];
    if (cannedWords.some(w => text.includes(w))) {
        return { category: 'Konserven', location: 'Vorratsschrank', mhdDays: null };
    }

    // 11. Trockenwaren
    const dryWords = [
        'nudel', 'pasta', 'spaghetti', 'penne', 'fusilli', 'tagliatelle', 'lasagne', 'reis', 'basmati', 'risotto',
        'mehl', 'weizenmehl', 'dinkelmehl', 'zucker', 'haferflocken', 'müsli', 'cornflakes', 'grieß', 'paniermehl', 'semmelbrösel',
        'couscous', 'bulgur', 'quinoa', 'knäckebrot', 'zwieback', 'baguette', 'ciabatta', 'toast', 'brot', 'brötchen',
        'en:pastas', 'en:rices', 'en:flours', 'en:cereals'
    ];
    if (dryWords.some(w => text.includes(w))) {
        return { category: 'Trockenwaren', location: 'Vorratsschrank', mhdDays: null };
    }

    // 12. Gewürze & Soßen
    const spiceSauceWords = [
        'gewürz', 'salz', 'pfeffer', 'paprikapulver', 'curry', 'kurkuma', 'oregano', 'thymian', 'zimt', 'muskat',
        'öl', 'olivenöl', 'rapsöl', 'sonnenblumenöl', 'essig', 'balsamico', 'sojasoße', 'sojasauce',
        'ketchup', 'senf', 'mayonnaise', 'remoulade', 'pesto', 'dressing', 'tabasco', 'grillsoße', 'barbecue',
        'en:spices', 'en:sauces', 'en:condiments', 'en:oils', 'en:vinegars'
    ];
    if (spiceSauceWords.some(w => text.includes(w))) {
        return {
            category: 'Gewürze',
            location: ['remoulade', 'mayonnaise', 'pesto'].some(w => nameLower.includes(w)) ? 'Kühlschrank' : 'Vorratsschrank',
            mhdDays: null
        };
    }

    // 13. Getränke
    const drinkWords = [
        'wasser', 'mineralwasser', 'sprudel', 'saft', 'apfelsaft', 'orangensaft', 'multivitamin', 'nektar', 'schorle',
        'cola', 'limonade', 'limo', 'eistee', 'energy', 'bier', 'radler', 'wein', 'sekt', 'prosecco',
        'sirup', 'kaffee', 'espresso', 'kaffeebohnen', 'kaffeepads', 'kapseln', 'tee', 'kakao',
        'en:waters', 'en:juices', 'en:sodas', 'en:soft-drinks', 'en:alcoholic-beverages', 'en:teas', 'en:coffees'
    ];
    if (drinkWords.some(w => text.includes(w))) {
        const isCellarDrink = ['kiste', 'kasten', 'bier', 'wein', 'sekt', 'mineralwasser', 'sprudel', 'saft'].some(w => nameLower.includes(w));
        return { category: 'Getränke', location: isCellarDrink ? 'Keller' : 'Vorratsschrank', mhdDays: null };
    }

    return {
        category: 'Sonstiges',
        location: ['eier', 'blätterteig', 'pizzateig', 'flammkuchenteig', 'hummus'].some(w => nameLower.includes(w)) ? 'Kühlschrank' : 'Vorratsschrank',
        mhdDays: null
    };
}
