// Library catalogue: 14 fields, each with topics. Every shelf book maps to a topic and has readable pages.
export interface Topic { n: string; t: string; k: string[] }
export interface Field { id: string; name: string; hue: number; level: "hall" | "gallery" | "base"; topics: Topic[] }
const T = (n: string, t: string, k: string[]): Topic => ({ n, t, k });

export const FIELDS: Field[] = [
  { id: "medicine", name: "Medicine", hue: 0.0, level: "hall", topics: [
    T("Human Anatomy", "Anatomy maps the body from organ systems down to tissues. Regional anatomy studies the body by area; systemic anatomy studies it by system such as the cardiovascular or nervous system.", ["organ system", "tissue", "regional anatomy", "surface landmarks"]),
    T("Physiology of the Heart", "The heart pumps blood in two circuits: pulmonary and systemic. Each beat starts at the sinoatrial node and spreads through the atria, then the ventricles, so the chambers contract in order.", ["SA node", "cardiac output", "systole", "diastole"]),
    T("Pharmacology Basics", "A drug's effect depends on what the body does to it (absorption, distribution, metabolism, excretion) and what it does to the body (receptor binding). The therapeutic window is the dose range between effect and toxicity.", ["pharmacokinetics", "receptor", "half-life", "therapeutic window"]),
    T("Infectious Diseases", "Pathogens include bacteria, viruses, fungi and parasites. Infection control rests on clean water, vaccination, hand hygiene and early treatment, which is why malaria and typhoid remain priorities in tropical medicine.", ["pathogen", "vaccine", "transmission", "antimicrobial"]),
    T("Clinical Examination", "A good clinical encounter follows a pattern: history, inspection, palpation, percussion and auscultation. Most diagnoses come from listening carefully to the patient's history before any test is ordered.", ["history taking", "inspection", "auscultation", "differential diagnosis"]),
    T("Public Health", "Public health protects populations rather than single patients. Epidemiology measures how often disease occurs, who gets it and why, which guides prevention programmes.", ["incidence", "prevalence", "epidemiology", "prevention"]),
  ]},
  { id: "biology", name: "Biology", hue: 0.33, level: "hall", topics: [
    T("The Cell", "The cell is the basic unit of life. Eukaryotic cells hold a nucleus and organelles such as mitochondria, ribosomes and the Golgi apparatus; prokaryotes lack a nucleus.", ["organelle", "nucleus", "mitochondrion", "membrane"]),
    T("Genetics and Heredity", "Genes are stretches of DNA that code for proteins. Mendel showed that traits are inherited as discrete units, with dominant alleles masking recessive ones in heterozygotes.", ["allele", "genotype", "phenotype", "Punnett square"]),
    T("Photosynthesis", "Plants convert light energy into chemical energy: six CO2 and six H2O make one glucose and six O2. Light reactions occur in the thylakoids; the Calvin cycle occurs in the stroma.", ["chlorophyll", "light reaction", "Calvin cycle", "stomata"]),
    T("Cell Respiration", "Respiration releases energy from glucose as ATP. Glycolysis, the Krebs cycle and the electron transport chain together yield about thirty ATP per glucose when oxygen is present.", ["ATP", "glycolysis", "Krebs cycle", "anaerobic"]),
    T("Evolution and Natural Selection", "Populations vary and some variants survive and reproduce better. Over generations favourable traits become common, which explains adaptation and the diversity of life.", ["variation", "adaptation", "fitness", "speciation"]),
    T("Ecology", "Ecology studies how organisms interact with each other and their environment. Energy flows through food chains while nutrients such as carbon and nitrogen cycle through ecosystems.", ["ecosystem", "food web", "niche", "biodiversity"]),
  ]},
  { id: "chemistry", name: "Chemistry", hue: 0.55, level: "hall", topics: [
    T("Atomic Structure", "Atoms have a nucleus of protons and neutrons surrounded by electrons in shells. The number of protons defines the element; electron arrangement decides how it bonds.", ["proton", "electron shell", "isotope", "atomic number"]),
    T("The Periodic Table", "Elements are arranged by atomic number so that groups share properties. Trends such as electronegativity and atomic radius change predictably across periods and down groups.", ["group", "period", "electronegativity", "metal"]),
    T("Chemical Bonding", "Ionic bonds transfer electrons; covalent bonds share them; metallic bonds pool them. Bond type explains melting points, conductivity and solubility.", ["ionic", "covalent", "lattice", "polarity"]),
    T("Acids, Bases and pH", "Acids donate protons and bases accept them. The pH scale is logarithmic: each unit is a tenfold change in hydrogen ion concentration.", ["pH", "buffer", "neutralisation", "indicator"]),
    T("Organic Chemistry", "Carbon forms chains and rings, giving millions of compounds. Functional groups such as alcohols, acids and amines decide how a molecule reacts.", ["hydrocarbon", "functional group", "isomer", "polymer"]),
    T("Rates and Equilibrium", "Reaction rate depends on concentration, temperature, surface area and catalysts. At equilibrium forward and reverse rates match, and Le Chatelier's principle predicts how it shifts under stress.", ["catalyst", "activation energy", "equilibrium", "Le Chatelier"]),
  ]},
  { id: "physics", name: "Physics", hue: 0.62, level: "hall", topics: [
    T("Newton's Laws", "An object keeps its motion unless a net force acts; force equals mass times acceleration; every action has an equal and opposite reaction. Together they explain everyday motion.", ["inertia", "F = ma", "momentum", "friction"]),
    T("Energy and Work", "Work is force through a distance and transfers energy. Energy is conserved: kinetic and potential forms convert but the total stays constant in a closed system.", ["kinetic energy", "potential energy", "power", "conservation"]),
    T("Waves and Sound", "Waves carry energy without carrying matter. Frequency, wavelength and speed are linked by v = f times wavelength, and sound is a longitudinal pressure wave.", ["frequency", "amplitude", "wavelength", "resonance"]),
    T("Electricity and Circuits", "Current is the flow of charge, driven by voltage against resistance. Ohm's law, V = IR, connects them and governs every simple circuit.", ["voltage", "current", "resistance", "Ohm's law"]),
    T("Optics", "Light reflects, refracts and diffracts. Lenses bend light to form images, which is how eyes, cameras and microscopes work.", ["refraction", "lens", "focal length", "total internal reflection"]),
    T("Thermal Physics", "Heat flows from hot to cold by conduction, convection and radiation. Temperature measures average particle energy, and specific heat capacity says how much energy changes it.", ["conduction", "specific heat", "entropy", "radiation"]),
  ]},
  { id: "maths", name: "Mathematics", hue: 0.75, level: "hall", topics: [
    T("Algebra", "Algebra uses symbols to express relationships. Solving an equation means applying the same operation to both sides until the unknown stands alone.", ["variable", "equation", "factorising", "quadratic"]),
    T("Calculus: Differentiation", "The derivative measures the instantaneous rate of change, the slope of a curve at a point. It finds maxima, minima and velocities.", ["limit", "gradient", "chain rule", "stationary point"]),
    T("Calculus: Integration", "Integration accumulates quantities and finds areas under curves. The fundamental theorem links it to differentiation as inverse operations.", ["antiderivative", "definite integral", "area", "substitution"]),
    T("Trigonometry", "Trigonometry relates angles to side ratios in right triangles: sine, cosine and tangent. It extends to waves through the unit circle.", ["sine", "cosine", "unit circle", "identity"]),
    T("Statistics and Probability", "Probability measures how likely events are. Statistics uses samples to estimate populations, summarised by the mean, spread and distribution.", ["mean", "variance", "normal distribution", "sample"]),
    T("Matrices and Vectors", "Vectors carry magnitude and direction; matrices transform them. Solving simultaneous equations and computer graphics both rely on matrices.", ["determinant", "inverse", "dot product", "transformation"]),
  ]},
  { id: "cs", name: "Computer Science", hue: 0.48, level: "hall", topics: [
    T("Algorithms", "An algorithm is a precise sequence of steps to solve a problem. Efficiency is measured by how running time grows with input size, written in Big-O notation.", ["Big-O", "sorting", "searching", "recursion"]),
    T("Data Structures", "Arrays, linked lists, stacks, queues, trees and hash tables organise data for fast access. Choosing the right structure often matters more than clever code.", ["array", "hash table", "tree", "graph"]),
    T("Databases", "Databases store data durably and answer queries. Relational databases use tables and SQL; indexes make lookups fast and transactions keep data consistent.", ["SQL", "index", "transaction", "schema"]),
    T("Networks and the Web", "Computers talk through layered protocols: IP routes packets, TCP makes delivery reliable and HTTP carries web pages. Browsers render what servers send.", ["IP", "TCP", "HTTP", "DNS"]),
    T("Artificial Intelligence", "Machine learning fits models to data instead of coding rules by hand. Neural networks stack simple units to learn patterns in text, images and sound.", ["training data", "neural network", "overfitting", "inference"]),
    T("Software Engineering", "Real software is built in teams: version control, testing and code review keep change safe. Good design keeps each part small and replaceable.", ["Git", "testing", "refactoring", "API"]),
  ]},
  { id: "engineering", name: "Engineering", hue: 0.08, level: "gallery", topics: [
    T("Statics and Structures", "Structures stand when forces balance. Engineers resolve loads into tension and compression and size members so stress stays below the material's strength.", ["load", "stress", "truss", "safety factor"]),
    T("Electrical Power Systems", "Power is generated, stepped up by transformers for transmission, then stepped down for homes. Three-phase supply keeps large motors smooth.", ["transformer", "three-phase", "grid", "load"]),
    T("Materials Science", "Properties come from structure: metals conduct, ceramics resist heat, polymers flex. Alloying and heat treatment tune strength and toughness.", ["alloy", "ductility", "fatigue", "composite"]),
    T("Thermodynamics of Engines", "Engines convert heat into work but never fully; the second law limits efficiency. Understanding cycles guides better engines and power plants.", ["Carnot", "cycle", "efficiency", "heat engine"]),
    T("Control Systems", "A controller compares what a system does with what you want and corrects the difference. Feedback keeps thermostats, drones and cruise control stable.", ["feedback", "PID", "stability", "sensor"]),
    T("Engineering Design", "Design is a loop: define the need, brainstorm, prototype, test, refine. Constraints of cost, safety and local conditions shape every decision.", ["requirements", "prototype", "tolerance", "iteration"]),
  ]},
  { id: "law", name: "Law", hue: 0.97, level: "gallery", topics: [
    T("Constitutional Law", "A constitution sets out how power is shared and limited and protects fundamental rights. Courts interpret it when laws or actions are challenged.", ["separation of powers", "fundamental rights", "judicial review", "federalism"]),
    T("Law of Contract", "A contract needs offer, acceptance, consideration and intention to be bound. Remedies for breach aim to put the innocent party where they would have been.", ["offer", "acceptance", "consideration", "breach"]),
    T("Criminal Law", "A crime usually needs a guilty act and a guilty mind. The state must prove guilt beyond reasonable doubt and the accused is presumed innocent.", ["actus reus", "mens rea", "burden of proof", "defence"]),
    T("Law of Torts", "Tort law compensates harm caused by wrongful acts outside contract. Negligence asks whether a duty was owed, breached and caused the loss.", ["duty of care", "negligence", "causation", "damages"]),
    T("Legal Method and Reasoning", "Lawyers argue from statutes and precedent. Reading a case means finding the facts, the issue, the holding and the reasoning, and separating binding rules from side remarks.", ["precedent", "ratio decidendi", "statute", "interpretation"]),
    T("International Law", "States make treaties and follow custom. Bodies such as the UN and the ICJ help settle disputes but depend on state consent.", ["treaty", "sovereignty", "custom", "arbitration"]),
  ]},
  { id: "business", name: "Business and Economics", hue: 0.13, level: "gallery", topics: [
    T("Microeconomics", "Prices coordinate buyers and sellers. Demand falls and supply rises with price, and the market clears where they meet; elasticity shows how sensitive each side is.", ["demand", "supply", "equilibrium", "elasticity"]),
    T("Macroeconomics", "Macroeconomics studies growth, inflation, unemployment and trade for a whole economy. Governments use fiscal and monetary policy to steer them.", ["GDP", "inflation", "monetary policy", "exchange rate"]),
    T("Accounting", "Accounting records transactions so owners can see performance. The balance sheet shows assets, liabilities and equity at a date; the income statement shows profit over a period.", ["asset", "liability", "profit", "cash flow"]),
    T("Marketing", "Marketing finds customer needs and meets them profitably. The mix of product, price, place and promotion should answer one clear customer problem.", ["segment", "positioning", "brand", "channel"]),
    T("Entrepreneurship", "Entrepreneurs spot a problem, test a small solution fast and learn from customers. Cash discipline and a clear way of making money decide who survives.", ["MVP", "unit economics", "traction", "pivot"]),
    T("Finance and Investing", "Money today is worth more than money later, so cash flows are discounted. Diversifying across assets lowers risk without necessarily lowering expected return.", ["interest", "risk", "diversification", "present value"]),
  ]},
  { id: "psychology", name: "Psychology", hue: 0.85, level: "gallery", topics: [
    T("Learning and Memory", "Memory is encoded, stored and retrieved. Spaced repetition and active recall beat rereading because retrieving a memory strengthens it.", ["encoding", "retrieval", "spacing effect", "working memory"]),
    T("Cognitive Biases", "The mind uses shortcuts that sometimes mislead us, such as confirmation bias and anchoring. Knowing them helps you check your own judgements.", ["heuristic", "confirmation bias", "anchoring", "framing"]),
    T("Child Development", "Children develop through stages in language, thinking and social skills. Responsive caregiving and play are among the strongest supports.", ["attachment", "milestone", "play", "language"]),
    T("Social Psychology", "People shape and are shaped by groups. Conformity, obedience and bystander effects show how situations can outweigh personal intentions.", ["conformity", "norm", "attribution", "prejudice"]),
    T("Motivation and Habit", "Habits form when a cue triggers a routine that earns a reward. Small, repeatable actions tied to a stable cue last longer than big bursts of willpower.", ["cue", "reward", "intrinsic motivation", "goal setting"]),
    T("Research Methods", "Psychologists test ideas with controlled experiments, surveys and observation. Random assignment and large samples reduce the chance that results are accidents.", ["variable", "control group", "sample size", "replication"]),
  ]},
  { id: "history", name: "History", hue: 0.07, level: "base", topics: [
    T("Ancient African Kingdoms", "Kemet, Kush, Aksum and Great Zimbabwe built cities, trade networks and writing long before colonial contact. Their records and monuments show complex states across the continent.", ["Kush", "Aksum", "trade route", "monument"]),
    T("West African Empires", "Ghana, Mali and Songhai grew rich from gold and salt trade across the Sahara. Timbuktu became a centre of scholarship, with libraries of thousands of manuscripts.", ["Mali", "Songhai", "Timbuktu", "Mansa Musa"]),
    T("History of Nigeria", "Nigeria's peoples built the Oyo, Benin, Hausa city-states and the Sokoto Caliphate. British rule joined the territories in 1914 and independence came in 1960.", ["Oyo", "Benin", "Sokoto", "independence"]),
    T("The Industrial Revolution", "From the 1700s, steam power and factories moved work from farms to cities. It raised output and living standards over time but brought hardship and pollution.", ["steam", "factory", "urbanisation", "labour"]),
    T("The World Wars", "Two global conflicts reshaped borders, economies and empires. Their aftermath led to the United Nations and to the wave of decolonisation in Africa and Asia.", ["alliance", "treaty", "decolonisation", "United Nations"]),
    T("Reading Historical Sources", "Historians weigh sources for who wrote them, when and why. Comparing several accounts, including oral traditions, gives a stronger picture than any single one.", ["primary source", "bias", "oral tradition", "corroboration"]),
  ]},
  { id: "literature", name: "Literature", hue: 0.92, level: "base", topics: [
    T("African Literature", "Writers such as Chinua Achebe, Wole Soyinka and Chimamanda Adichie tell African stories in their own voices. Themes include tradition and change, colonialism and identity.", ["Achebe", "Soyinka", "identity", "oral storytelling"]),
    T("The Novel", "A novel builds a world through plot, character, setting and point of view. Who tells the story changes what the reader can know and trust.", ["plot", "narrator", "setting", "theme"]),
    T("Poetry", "Poetry compresses language through rhythm, imagery and sound. Reading a poem means asking why each word and line break was chosen.", ["metaphor", "metre", "imagery", "stanza"]),
    T("Drama", "Drama is written to be performed. Conflict drives scenes while dialogue and stage directions reveal character without a narrator.", ["act", "conflict", "soliloquy", "stagecraft"]),
    T("Essay and Rhetoric", "A strong argument has a clear claim, evidence and reasoning. Rhetoric studies how appeals to logic, character and emotion persuade an audience.", ["thesis", "ethos", "logos", "pathos"]),
    T("Creative Writing", "Writers show instead of telling and revise ruthlessly. Specific detail and a clear want for the main character make scenes alive.", ["voice", "scene", "draft", "revision"]),
  ]},
  { id: "philosophy", name: "Philosophy", hue: 0.7, level: "base", topics: [
    T("Logic and Argument", "An argument is valid when its conclusion follows from its premises, and sound when the premises are also true. Spotting fallacies keeps reasoning honest.", ["premise", "validity", "fallacy", "deduction"]),
    T("Ethics", "Ethics asks how we ought to live. Consequentialism judges actions by outcomes, deontology by duties and virtue ethics by character.", ["utilitarianism", "duty", "virtue", "justice"]),
    T("Theory of Knowledge", "Epistemology asks what we can know and how. Empiricists trust experience; rationalists trust reason; most thinkers mix the two.", ["empiricism", "rationalism", "justification", "scepticism"]),
    T("Philosophy of Mind", "How do brains give rise to minds? Dualists separate the two; physicalists say the mind is what the brain does. Consciousness remains an open question.", ["dualism", "consciousness", "qualia", "free will"]),
    T("African Philosophy", "Ubuntu holds that a person is a person through other persons. African thought stresses community, shared responsibility and wisdom passed through proverbs and stories.", ["Ubuntu", "community", "proverb", "personhood"]),
    T("Political Philosophy", "What makes power legitimate? Thinkers from Plato to Rawls ask about justice, liberty and the social contract that binds citizens and states.", ["social contract", "liberty", "justice", "legitimacy"]),
  ]},
  { id: "arts", name: "Arts and Design", hue: 0.18, level: "base", topics: [
    T("Colour Theory", "Colours relate on the wheel as complements, analogues and triads. Contrast and temperature guide the eye and set mood.", ["hue", "contrast", "complementary", "saturation"]),
    T("Typography and Layout", "Type carries tone before words are read. Hierarchy, spacing and alignment make a page easy to scan.", ["hierarchy", "kerning", "grid", "contrast"]),
    T("African Art and Textiles", "Benin bronzes, Ife heads, adire and aso-oke show centuries of craft. Patterns often carry meaning about status, proverbs and community.", ["Benin bronze", "adire", "aso-oke", "symbolism"]),
    T("Music Theory", "Music organises pitch and time into scales, chords and rhythm. Understanding intervals helps you hear how tension resolves.", ["scale", "chord", "rhythm", "harmony"]),
    T("Film and Storytelling", "Film tells stories through image, sound and editing. Nollywood shows how limited budgets can still reach huge audiences with strong stories.", ["shot", "edit", "script", "Nollywood"]),
    T("Interface Design", "Good interfaces make the next step obvious. Test with real users, cut every extra element and make touch targets large.", ["usability", "affordance", "feedback", "accessibility"]),
  ]},
];

const AUTHORS = ["A. Okafor", "B. Adeyemi", "C. Nwosu", "D. Bello", "E. Ibrahim", "F. Eze", "G. Mensah", "H. Okoye", "I. Danjuma", "J. Abubakar", "K. Adebayo", "L. Chukwu", "M. Oyelaran", "N. Balogun", "O. Afolabi", "P. Umeh"];
const KIND = ["Foundations of", "A Student's Guide to", "Principles of", "Essentials of", "Advanced", "Notes on", "Introduction to", "Research in", "Handbook of", "Revision Atlas:"];

export interface BookData { id: string; field: string; title: string; author: string; pages: { h: string; b: string }[] }

/** Deterministic book from (field, serial number). Same inputs always give the same book, so no big catalogue is stored. */
export function makeBook(f: Field, serial: number): BookData {
  const topic = f.topics[serial % f.topics.length]!;
  const kind = KIND[(serial * 7 + f.name.length) % KIND.length]!;
  const vol = 1 + (Math.floor(serial / (f.topics.length * KIND.length)) % 6);
  const author = AUTHORS[(serial * 5 + f.id.length) % AUTHORS.length]!;
  const title = `${kind} ${topic.n}${vol > 1 ? ` · Vol. ${vol}` : ""}`;
  const sentences = topic.t.split(/(?<=\.)\s+/);
  return {
    id: `${f.id}-${serial}`, field: f.name, title, author,
    pages: [
      { h: `${f.name}: ${topic.n}`, b: sentences[0] ?? topic.t },
      { h: "Chapter 1 · The idea", b: topic.t },
      { h: "Key terms", b: topic.k.map((k, i) => `${i + 1}. ${k}`).join("\n") + "\n\nWrite each term in your own words, then check it against the chapter." },
      { h: "Think it through", b: `Explain "${topic.n}" to a classmate in three sentences.\n\nThen name one real situation where ${topic.k[0]} matters, and one question you still have. Bring it to the study group.` },
    ],
  };
}
