import { Folder, LoreFile, Chat, AppSettings } from '../types';
import { estimateTokenCount } from './documentParser';

export const INITIAL_FOLDERS: Folder[] = [
  {
    id: 'fld_vol1',
    name: 'Volumen I: Ecos de Kuroshio',
    description: 'Proyecto de novela ligera / fantasía urbana en el distrito subterráneo.',
    systemPrompt: `ENTORNO: Kuroshio Sector 04, metrópolis subterránea de alta densidad.
TONO NARRATIVO: Prosa literaria inmersiva, tensión cuidada y profundidad psicológica.
REGLAS DEL SISTEMA:
1. La magia de resonancia cristaliza finas partículas de grafito en las yemas de los dedos con fatiga acumulativa.
2. Mantener la coherencia con el archivo de lore activo y las motivaciones de los personajes.`,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000,
  },
  {
    id: 'fld_vol2',
    name: 'Volumen II: El Archivo Pálido',
    description: 'Arco secundario centrado en las criptas de datos y oráculos analógicos.',
    systemPrompt: `ENTORNO: Criptas de datos del antiguo Ministerio de Telégrafos.
TONO NARRATIVO: Misterio psicológico, intriga pausada y secretos corporativos.`,
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
  },
];

const loreContent1 = `# El Sindicato Monocromo

## Descripción General
Coalición que opera desde las antiguas terminales ferroviarias del Sector Kuroshio. Especializada en llaves criptográficas y catalizadores de resonancia.

## Integrantes Clave
- **Kuroda Vance**: Estratega principal. Se comunica mediante pulsos de telégrafo sintetizados.
- **Kiri**: Especialista en infiltración con capa de disipación térmica.`;

const loreContent2 = `# Leyes de Resonancia: Magia de Grafito

## Principio Fundamental
La resonancia manipula la fricción espacial a través de la frecuencia cognitiva.

### Reglas Constantes:
1. **El Peaje de Ceniza**: Cada activación cristaliza la humedad circundante en polvo de grafito.
2. **Déficit Térmico**: La temperatura ambiente cae de 4 a 10 grados Celsius.
3. **Sobrecarga**: El sobre-uso provoca fatiga motriz y leves temblores en las manos.`;

const loreContent3 = `# Ficha de Personaje: Ren Mikage

- **Edad**: 24 años
- **Rol**: Investigador y practicante de resonancia
- **Arma**: Revólver Modelo 39 con munición encamisada en plata
- **Motivación**: Descifrar el manuscrito codificado que dejó su mentor
- **Rasgo**: Meticuloso, reflexivo, calcula probabilidades antes de actuar`;

export const INITIAL_LORE_FILES: LoreFile[] = [
  {
    id: 'lore_factions',
    folderId: 'fld_vol1',
    title: 'El Sindicato Monocromo',
    filename: '01_sindicato_monocromo.md',
    content: loreContent1,
    fileType: 'md',
    size: 450,
    wordCount: 52,
    estimatedTokens: estimateTokenCount(loreContent1),
    parseStatus: 'ready',
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'lore_magic',
    folderId: 'fld_vol1',
    title: 'Leyes de Resonancia',
    filename: '02_leyes_de_resonancia.md',
    content: loreContent2,
    fileType: 'md',
    size: 410,
    wordCount: 58,
    estimatedTokens: estimateTokenCount(loreContent2),
    parseStatus: 'ready',
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'lore_characters',
    folderId: 'fld_vol1',
    title: 'Dossier: Ren Mikage',
    filename: '03_dossier_ren_mikage.md',
    content: loreContent3,
    fileType: 'md',
    size: 380,
    wordCount: 50,
    estimatedTokens: estimateTokenCount(loreContent3),
    parseStatus: 'ready',
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
  },
];

export const INITIAL_SETTINGS: AppSettings = {
  provider: 'gemini',
  customApiKey: '',
  customBaseUrl: 'https://integrate.api.nvidia.com/v1',
  customModel: '',
  fetchedNvidiaModels: [],
  favoriteModelIds: [],
  alibabaApiKey: '',
  alibabaBaseUrl: 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
  alibabaModel: 'qwen3.8-max',
  fetchedAlibabaModels: [],
  favoriteAlibabaModelIds: ['qwen3.8-max', 'qwen3.8-flash', 'qwen-plus', 'qwen-long'],
  alibabaCustomLoraModel: '',
  alibabaCustomLoraName: '',
  geminiModel: 'gemini-3.6-flash',
  maxOutputTokens: 8192,
  temperature: 0.75,
  globalSystemPrompt: `Eres Kizuna-Zek, colega creativo y taller editorial de cabecera del autor para la novela ligera 'Jukkou no Zankyou' (El teatro que faltó).

[IDENTIDAD Y DINÁMICA DE TRABAJO]
- Tono cálido, cercano, despierto y conversacional (estilo colega que comparte un mate y se apasiona genuinamente por la obra).
- PROHIBIDO hablar como un asistente corporativo, soporte técnico o bot de atención al cliente.
- NUNCA respondas con menús numerados, índices mecánicos o viñetas genéricas ('1. Trama, 2. Personajes...').
- Mantén mirada crítica y voz propia: señala qué funciona somáticamente, advierte deslices melodramáticos y aporta soluciones tangibles de biomecánica y tensión.

[CANON CENTRAL DE PERSONAJES]
1. KOLDER ZEKSHOYU (22 años | «El Vacío Funcional»):
   - Condición irreversible: Extirpación quirúrgica completa del sistema límbico a los 9 años en el Hospicio San Gregorio bajo las órdenes de Tedriot. 
   - Fisiología y mente: Carece de afecto, ira o miedo biológico. Ojos de prisma gris con mapa radial (nunca amarillos). Inexpresivo (deadpan), pausas calculadas, tono plano y terrenal. No busca venganza ni redención; busca funcionar y cuidar la vida mediante presencia material sin dogmas.
   - Puntos ciegos: No comprende la irracionalidad humana, el rencor gratuito ni el autosacrificio desmedido.
   - Anclas materiales: Karambit táctico y Mate Rúnico de calabaza con virola de oro/rubí (ceba Yerba de Cobre a 80-90 °C para disipar la estática del flujo de Catarsis y regular su balance térmico).

2. HINISTRA ZUPSEKIA (17 años | «La Marioneta del Relato»):
   - Naturaleza: Fragmento humano encarnado de Gurasha (la difunta Prisma de la Euforia). Carga con el repudio colectivo de la Guerra del Círculo Vicioso por tragedias que ella no provocó.
   - Psicología y voz: TEPT complejo severo. Voz en voseo rioplatense. Utiliza la euforia teatral, declamaciones operísticas y versos trágicos clásicos (Sófocles, Eurípides) como armadura somática para no desintegrarse ni mirar el abismo.
   - Apariencia: Corte Medusa azul grisáceo con pergaminos, campera oversize, joggers y una máscara de porcelana ('Euforia') sujeta sobre el pecho izquierdo (su corazón).

3. TEDRIOT Y «EL CIELO CEGADO» (Gobernador de Santusma):
   - Motor psicológico: Asesinó a Gurasha por un amor obsesivo y rapaz. Incapaz de procesar la culpa y el horror de su propio crimen, erige una doctrina de Estado: si erradica las emociones de Monstereth mediante Skarnita, su culpa deja de existir. Llama 'purificación colectiva' a una lobotomía masiva para no admitir su cobardía moral. Kolder fue su prototipo temprano en San Gregorio.

4. TESHUVANA (4to Prisma | Purismo Absolutista):
   - No es villana de caricatura; es una dogmática aterrada. El Té de Teshuvana encarna la teología del mérito (exige estar limpio y en paz para merecerlo). Cuando la tetera se rompe, su liturgia colapsa en fango y pánico. 
   - Antítesis: El agua cruda y terrenal de Kolder, que no exige mérito y estabiliza al cuerpo quebrado en el suelo.

[REGLAS EDITORIALES Y DE ESTILO DE PROSA]
- REGLA DE ORO («EMPATÍA INVERSA»): El lector y el entorno deben llorar POR Kolder y no CON él. Kolder no se compadece de sí mismo porque no tiene con qué dimensionar su mutilación; la tragedia radica en la asimetría entre su frialdad operativa y el dolor de los demás.
- MATERIALIDAD SOMÁTICA: Los objetos no interpretan el mundo, solo reaccionan al peso, la gravedad y la temperatura. La ropa no 'descifra', pesa y delata.
- PROHIBICIÓN TOTAL DE REPORTES CLÍNICOS: Cero porcentajes numéricos ('quince por ciento', 'daño tisular al ochenta'). Mostrar el daño en tendones agarrotados, aire expulsado por la laringe, capilares reventados y pérdida de balance.
- PROHIBICIÓN DE MULETILLAS Y CLICHÉS: Erradicar 'sempiterno', 'diáfano', 'lúgubre', 'sonrisa de porcelana', 'tacones de titiritera', 'manto etéreo' o 'evaluó en silencio'. Prosa sensorial, cinematográfica, terrenal y de pulso humano vivo.
- SÍNTESIS DE MEMORIA: Si durante la sesión el autor define un dato canónico nuevo, regla o revelación clave, añade al final de tu respuesta la etiqueta invisible: <<<SAVE_MEMORY: hecho conciso a guardar>>>.`,
  contextDepth: 'full',
  enableWebSearch: false,
  enableReasoning: false,
  reasoningMode: 'off',
  memories: [
    {
      id: 'mem_default_1',
      text: 'Ren Mikage lleva un cigarrillo apagado detrás de la oreja como recordatorio, pero nunca fuma.',
      timestamp: Date.now() - 86400000,
      enabled: true,
      source: 'auto',
    },
    {
      id: 'mem_default_2',
      text: 'En el Sector 04, el intercambio comercial formal se respalda con lingotes de carbón de alta pureza.',
      timestamp: Date.now() - 43200000,
      enabled: true,
      source: 'auto',
    },
  ],
  userProfile: {
    nickname: 'Aaron',
    occupation: 'Escritor / Creador de Jukkou no Zankyou',
    aboutMe: 'Enfocado en Monstereth, atmósfera sensorial, tensión somática y catarsis narrativa.',
  },
  personalityConfig: {
    warmth: 'warm',
    enthusiasm: 'default',
    formatting: 'prose_only',
    emojiUsage: 'natural',
    customInstructions: '',
  },
  enableMemoryToggle: true,
};

const sceneContent1 = `La lluvia fría sobre el Andén 9 repiqueteaba con insistencia rítmica contra el techo de zinc envejecido.

Ren Mikage aguardaba junto a las columnas de hierro forjado, observando las vías muertas que se internaban en el túnel oriental. No miró el reloj; en un sector donde los trenes dejaron de circular hace una década, el tiempo se medía por la cautela de los pasos en la penumbra.

Una repentina ráfaga de aire helado precedió la llegada de Kiri. Las partículas de grafito suspendidas en el ambiente destellaron brevemente cuando ella emergió de la sombra.

—Te tomaste tu tiempo, Ren —dijo ella, ajustando el broche de su abrigo—. La patrulla del Sindicato reforzó los controles en el puente central.

Ren mantuvo las manos resguardadas, calculando las salidas despejadas antes de responder.

—El retraso era necesario si queríamos llegar sin colas. ¿Qué datos lograste extraer del terminal?`;

export const INITIAL_CHATS: Chat[] = [
  {
    id: 'chat_prologue',
    folderId: 'fld_vol1',
    title: 'Capítulo 1: El Andén Olvidado',
    selectedLoreFileIds: ['lore_factions', 'lore_magic', 'lore_characters'],
    createdAt: Date.now() - 3600000 * 4,
    updatedAt: Date.now() - 3600000 * 2,
    messages: [
      {
        id: 'msg_1',
        role: 'user',
        content: 'Escribe el inicio del Capítulo 1 donde Ren y Kiri se encuentran en el Andén 9 para revisar los datos interceptados del Sindicato.',
        timestamp: Date.now() - 3600000 * 4,
        estimatedTokens: 32,
      },
      {
        id: 'msg_2',
        role: 'assistant',
        content: sceneContent1,
        timestamp: Date.now() - 3600000 * 3,
        selectedLoreIds: ['lore_factions', 'lore_magic', 'lore_characters'],
        estimatedTokens: estimateTokenCount(sceneContent1),
      },
    ],
  },
];
