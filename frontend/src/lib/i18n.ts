/**
 * Static, pre-translated patient-interface strings and message templates.
 * Composed messages are built ONLY from these templates + the patient's explicit selections,
 * so the spoken output is deterministic and never an AI paraphrase.
 * (Translations authored for the prototype; should be reviewed by native-speaking clinicians.)
 */
export type Lang = 'en' | 'es' | 'fr' | 'hi' | 'zh'
export const LANGS: { code: Lang; name: string; native: string }[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'zh', name: 'Chinese', native: '中文' },
]
export const asLang = (l?: string | null): Lang => (LANGS.some((x) => x.code === l) ? (l as Lang) : 'en')

type UI = Record<
  | 'help' | 'yes' | 'no' | 'unsure' | 'repeat' | 'back' | 'stop' | 'confirm' | 'waiting' | 'waitingSub'
  | 'yourMessage' | 'reviewPrompt' | 'sent' | 'sentSub' | 'whereExactly' | 'howStrong' | 'whatFeel' | 'skip'
  | 'quickNeeds' | 'helpSent' | 'helpSentSub' | 'helpLocal' | 'cancelHelp' | 'startOver' | 'translationUnavailable'
  | 'clinicianAsks' | 'offline' | 'chooseAnswer' | 'stopped' | 'resume' | 'whereHurts' | 'speaking' | 'other'
  | 'settings' | 'ended' | 'loading',
  string>

export const UI_TEXT: Record<Lang, UI> = {
  en: {
    help: 'Help', yes: 'Yes', no: 'No', unsure: 'Unsure', repeat: 'Repeat', back: 'Back', stop: 'Stop',
    confirm: 'Confirm and Speak', waiting: 'Waiting for your clinician', waitingSub: 'You can also tell them something now.',
    yourMessage: 'Your message', reviewPrompt: 'Is this what you want to say?', sent: 'Message spoken',
    sentSub: 'Your clinician received your message.', whereExactly: 'Where exactly?', howStrong: 'How strong is the pain?',
    whatFeel: 'What does it feel like?', skip: 'Skip', quickNeeds: 'Tell your care team', helpSent: 'Help is on the way',
    helpSentSub: 'Your care team has been alerted.', helpLocal: 'Alarm sounding — staff nearby will hear it.',
    cancelHelp: 'Cancel alarm', startOver: 'Start over', translationUnavailable: 'Translation unavailable — showing original',
    clinicianAsks: 'Your clinician asks', offline: 'Reconnecting…', chooseAnswer: 'Choose your answer',
    stopped: 'Paused', resume: 'Resume', whereHurts: 'Where does it hurt?', speaking: 'Speaking…', other: 'Something else', settings: 'Settings', ended: 'Session ended', loading: 'Loading communication board…',
  },
  es: {
    help: 'Ayuda', yes: 'Sí', no: 'No', unsure: 'No sé', repeat: 'Repetir', back: 'Atrás', stop: 'Parar',
    confirm: 'Confirmar y hablar', waiting: 'Esperando a su médico', waitingSub: 'También puede decirle algo ahora.',
    yourMessage: 'Su mensaje', reviewPrompt: '¿Es esto lo que quiere decir?', sent: 'Mensaje dicho',
    sentSub: 'Su médico recibió su mensaje.', whereExactly: '¿Dónde exactamente?', howStrong: '¿Qué tan fuerte es el dolor?',
    whatFeel: '¿Cómo se siente?', skip: 'Omitir', quickNeeds: 'Dígale a su equipo', helpSent: 'La ayuda está en camino',
    helpSentSub: 'Se avisó a su equipo de atención.', helpLocal: 'Alarma sonando — el personal cercano la oirá.',
    cancelHelp: 'Cancelar alarma', startOver: 'Empezar de nuevo', translationUnavailable: 'Traducción no disponible — se muestra el original',
    clinicianAsks: 'Su médico pregunta', offline: 'Reconectando…', chooseAnswer: 'Elija su respuesta',
    stopped: 'En pausa', resume: 'Continuar', whereHurts: '¿Dónde le duele?', speaking: 'Hablando…', other: 'Otra cosa', settings: 'Ajustes', ended: 'Sesión terminada', loading: 'Cargando tablero de comunicación…',
  },
  fr: {
    help: 'Aide', yes: 'Oui', no: 'Non', unsure: 'Je ne sais pas', repeat: 'Répéter', back: 'Retour', stop: 'Arrêt',
    confirm: 'Confirmer et dire', waiting: 'En attente de votre soignant', waitingSub: 'Vous pouvez aussi lui dire quelque chose.',
    yourMessage: 'Votre message', reviewPrompt: 'Est-ce bien ce que vous voulez dire ?', sent: 'Message prononcé',
    sentSub: 'Votre soignant a reçu votre message.', whereExactly: 'Où exactement ?', howStrong: 'Quelle est l’intensité de la douleur ?',
    whatFeel: 'Comment est la douleur ?', skip: 'Passer', quickNeeds: 'Dites à votre équipe', helpSent: 'L’aide arrive',
    helpSentSub: 'Votre équipe a été alertée.', helpLocal: 'Alarme en cours — le personnel proche l’entendra.',
    cancelHelp: 'Arrêter l’alarme', startOver: 'Recommencer', translationUnavailable: 'Traduction indisponible — texte original',
    clinicianAsks: 'Votre soignant demande', offline: 'Reconnexion…', chooseAnswer: 'Choisissez votre réponse',
    stopped: 'En pause', resume: 'Reprendre', whereHurts: 'Où avez-vous mal ?', speaking: 'Lecture…', other: 'Autre chose', settings: 'Réglages', ended: 'Séance terminée', loading: 'Chargement du tableau de communication…',
  },
  hi: {
    help: 'मदद', yes: 'हाँ', no: 'नहीं', unsure: 'पता नहीं', repeat: 'दोहराएँ', back: 'वापस', stop: 'रुकें',
    confirm: 'पुष्टि करें और बोलें', waiting: 'आपके डॉक्टर की प्रतीक्षा', waitingSub: 'आप अभी भी कुछ बता सकते हैं।',
    yourMessage: 'आपका संदेश', reviewPrompt: 'क्या आप यही कहना चाहते हैं?', sent: 'संदेश बोला गया',
    sentSub: 'आपके डॉक्टर को आपका संदेश मिल गया।', whereExactly: 'ठीक कहाँ?', howStrong: 'दर्द कितना तेज़ है?',
    whatFeel: 'दर्द कैसा महसूस होता है?', skip: 'छोड़ें', quickNeeds: 'अपनी देखभाल टीम को बताएँ', helpSent: 'मदद आ रही है',
    helpSentSub: 'आपकी देखभाल टीम को सूचित कर दिया गया है।', helpLocal: 'अलार्म बज रहा है — पास के कर्मचारी सुनेंगे।',
    cancelHelp: 'अलार्म बंद करें', startOver: 'फिर से शुरू करें', translationUnavailable: 'अनुवाद उपलब्ध नहीं — मूल पाठ',
    clinicianAsks: 'आपके डॉक्टर पूछ रहे हैं', offline: 'फिर से जुड़ रहा है…', chooseAnswer: 'अपना उत्तर चुनें',
    stopped: 'रुका हुआ', resume: 'जारी रखें', whereHurts: 'दर्द कहाँ है?', speaking: 'बोल रहा है…', other: 'कुछ और', settings: 'सेटिंग्स', ended: 'सत्र समाप्त', loading: 'संचार बोर्ड लोड हो रहा है…',
  },
  zh: {
    help: '求助', yes: '是', no: '不是', unsure: '不确定', repeat: '重复', back: '返回', stop: '暂停',
    confirm: '确认并朗读', waiting: '等待医生提问', waitingSub: '您也可以现在告诉他们一些事情。',
    yourMessage: '您的消息', reviewPrompt: '这是您想说的吗？', sent: '消息已朗读',
    sentSub: '您的医生已收到消息。', whereExactly: '具体在哪里？', howStrong: '疼痛有多严重？',
    whatFeel: '是什么样的痛？', skip: '跳过', quickNeeds: '告诉医护人员', helpSent: '医护人员马上就到',
    helpSentSub: '已通知您的医护团队。', helpLocal: '警报正在响 — 附近的医护人员会听到。',
    cancelHelp: '关闭警报', startOver: '重新开始', translationUnavailable: '翻译不可用 — 显示原文',
    clinicianAsks: '您的医生问', offline: '正在重新连接…', chooseAnswer: '请选择您的回答',
    stopped: '已暂停', resume: '继续', whereHurts: '哪里痛？', speaking: '正在朗读…', other: '其他', settings: '设置', ended: '会话已结束', loading: '正在加载沟通板…',
  },
}

// ---------------- Body regions ----------------
export type Region = 'head' | 'neck' | 'chest' | 'stomach' | 'back' | 'arms' | 'legs' | 'pelvis' | 'whole_body' | 'other'
export const REGION_ORDER: Region[] = ['head', 'neck', 'chest', 'stomach', 'back', 'arms', 'legs', 'pelvis', 'whole_body', 'other']

export const REGION_LABEL: Record<Lang, Record<Region, string>> = {
  en: { head: 'Head', neck: 'Neck', chest: 'Chest', stomach: 'Stomach', back: 'Back', arms: 'Arms', legs: 'Legs', pelvis: 'Pelvis or groin', whole_body: 'All over', other: 'Somewhere else' },
  es: { head: 'Cabeza', neck: 'Cuello', chest: 'Pecho', stomach: 'Estómago', back: 'Espalda', arms: 'Brazos', legs: 'Piernas', pelvis: 'Pelvis o ingle', whole_body: 'Todo el cuerpo', other: 'Otro lugar' },
  fr: { head: 'Tête', neck: 'Cou', chest: 'Poitrine', stomach: 'Ventre', back: 'Dos', arms: 'Bras', legs: 'Jambes', pelvis: 'Bassin ou aine', whole_body: 'Partout', other: 'Ailleurs' },
  hi: { head: 'सिर', neck: 'गर्दन', chest: 'छाती', stomach: 'पेट', back: 'पीठ', arms: 'बाहें', legs: 'पैर', pelvis: 'श्रोणि या कमर', whole_body: 'पूरे शरीर में', other: 'कहीं और' },
  zh: { head: '头', neck: '脖子', chest: '胸口', stomach: '肚子', back: '背', arms: '手臂', legs: '腿', pelvis: '骨盆或腹股沟', whole_body: '全身', other: '其他地方' },
}

const REGION_PHRASE: Record<Lang, Partial<Record<Region, string>>> = {
  en: { head: 'my head', neck: 'my neck', chest: 'my chest', stomach: 'my stomach', back: 'my back', arms: 'my arms', legs: 'my legs', pelvis: 'my pelvis or groin' },
  es: { head: 'la cabeza', neck: 'el cuello', chest: 'el pecho', stomach: 'el estómago', back: 'la espalda', arms: 'los brazos', legs: 'las piernas', pelvis: 'la pelvis o la ingle' },
  fr: { head: 'à la tête', neck: 'au cou', chest: 'à la poitrine', stomach: 'au ventre', back: 'au dos', arms: 'aux bras', legs: 'aux jambes', pelvis: 'au bassin ou à l’aine' },
  hi: { head: 'सिर', neck: 'गर्दन', chest: 'छाती', stomach: 'पेट', back: 'पीठ', arms: 'बाहों', legs: 'पैरों', pelvis: 'श्रोणि या कमर' },
  zh: { head: '头', neck: '脖子', chest: '胸口', stomach: '肚子', back: '背', arms: '手臂', legs: '腿', pelvis: '骨盆或腹股沟' },
}

export type SubRegion = { key: string; label: Record<Lang, string>; zone: string }
const sub = (key: string, zone: string, en: string, es: string, fr: string, hi: string, zh: string): SubRegion =>
  ({ key, zone, label: { en, es, fr, hi, zh } })
const SIDES = (zoneL: string, zoneR: string) => [
  sub('left', zoneL, 'left side', 'lado izquierdo', 'côté gauche', 'बाईं ओर', '左侧'),
  sub('right', zoneR, 'right side', 'lado derecho', 'côté droit', 'दाईं ओर', '右侧'),
  sub('both', `${zoneL},${zoneR}`, 'both sides', 'ambos lados', 'des deux côtés', 'दोनों ओर', '两侧'),
]

export const SUB_REGIONS: Partial<Record<Region, SubRegion[]>> = {
  stomach: [
    sub('upper_right', 'abd-ur', 'upper right', 'parte superior derecha', 'en haut à droite', 'ऊपर दाईं ओर', '右上方'),
    sub('upper_left', 'abd-ul', 'upper left', 'parte superior izquierda', 'en haut à gauche', 'ऊपर बाईं ओर', '左上方'),
    sub('center', 'abd-c', 'around the belly button', 'alrededor del ombligo', 'autour du nombril', 'नाभि के आसपास', '肚脐周围'),
    sub('lower_right', 'abd-lr', 'lower right', 'parte inferior derecha', 'en bas à droite', 'नीचे दाईं ओर', '右下方'),
    sub('lower_left', 'abd-ll', 'lower left', 'parte inferior izquierda', 'en bas à gauche', 'नीचे बाईं ओर', '左下方'),
  ],
  chest: [
    sub('left', 'chest-l', 'left side', 'lado izquierdo', 'côté gauche', 'बाईं ओर', '左侧'),
    sub('center', 'chest-c', 'center', 'centro', 'au centre', 'बीच में', '中间'),
    sub('right', 'chest-r', 'right side', 'lado derecho', 'côté droit', 'दाईं ओर', '右侧'),
  ],
  head: [
    sub('forehead', 'head', 'forehead', 'frente', 'le front', 'माथा', '额头'),
    sub('back_of_head', 'head', 'back of the head', 'parte de atrás', 'l’arrière de la tête', 'सिर का पिछला हिस्सा', '后脑'),
    sub('left', 'head', 'left side', 'lado izquierdo', 'côté gauche', 'बाईं ओर', '左侧'),
    sub('right', 'head', 'right side', 'lado derecho', 'côté droit', 'दाईं ओर', '右侧'),
  ],
  back: [
    sub('upper', 'chest-c', 'upper back', 'parte superior', 'en haut', 'ऊपरी हिस्सा', '上背部'),
    sub('lower', 'abd-c', 'lower back', 'parte baja', 'en bas', 'निचला हिस्सा', '下背部'),
  ],
  arms: SIDES('arm-r', 'arm-l'),
  legs: SIDES('leg-r', 'leg-l'),
}

export function painLocationSentence(lang: Lang, region: Region, subLabel?: string): string {
  if (region === 'whole_body') return { en: 'I have pain all over.', es: 'Me duele todo el cuerpo.', fr: 'J’ai mal partout.', hi: 'मुझे पूरे शरीर में दर्द है।', zh: '我全身都痛。' }[lang]
  if (region === 'other') return { en: 'I have pain somewhere else.', es: 'Me duele en otro lugar.', fr: 'J’ai mal ailleurs.', hi: 'मुझे किसी और जगह दर्द है।', zh: '我别的地方痛。' }[lang]
  const r = REGION_PHRASE[lang][region] ?? REGION_LABEL[lang][region]
  switch (lang) {
    case 'en': return `I have pain in ${r}${subLabel ? `, ${subLabel}` : ''}.`
    case 'es': return `Tengo dolor en ${r}${subLabel ? `, ${subLabel}` : ''}.`
    case 'fr': return `J’ai une douleur ${r}${subLabel ? `, ${subLabel}` : ''}.`
    case 'hi': return `मुझे ${r} में दर्द है${subLabel ? ` (${subLabel})` : ''}।`
    case 'zh': return `我的${r}痛${subLabel ? `（${subLabel}）` : ''}。`
  }
}

// ---------------- Pain intensity ----------------
export const SCALE_POINTS = [0, 2, 4, 6, 8, 10] as const
export const SCALE_LABEL: Record<Lang, string[]> = {
  en: ['No pain', 'Mild', 'Moderate', 'Strong', 'Severe', 'Worst possible'],
  es: ['Sin dolor', 'Leve', 'Moderado', 'Fuerte', 'Severo', 'El peor posible'],
  fr: ['Aucune douleur', 'Légère', 'Modérée', 'Forte', 'Sévère', 'La pire possible'],
  hi: ['कोई दर्द नहीं', 'हल्का', 'मध्यम', 'तेज़', 'बहुत तेज़', 'असहनीय'],
  zh: ['不痛', '轻微', '中等', '较强', '严重', '最痛'],
}
export function intensitySentence(lang: Lang, n: number): string {
  return {
    en: `My pain is ${n} out of 10.`, es: `Mi dolor es ${n} de 10.`, fr: `Ma douleur est à ${n} sur 10.`,
    hi: `मेरा दर्द 10 में से ${n} है।`, zh: `我的疼痛程度是${n}分（满分10分）。`,
  }[lang]
}

// ---------------- Pain quality ----------------
export const QUALITIES: { key: string; icon: string; label: Record<Lang, string>; sentence: Record<Lang, string> }[] = [
  { key: 'sharp', icon: 'pain-sharp', label: { en: 'Sharp', es: 'Punzante', fr: 'Aiguë', hi: 'चुभने वाला', zh: '刺痛' },
    sentence: { en: 'It feels sharp.', es: 'Es un dolor punzante.', fr: 'C’est une douleur aiguë.', hi: 'दर्द चुभने वाला है।', zh: '是刺痛。' } },
  { key: 'dull', icon: 'pain-dull', label: { en: 'Dull ache', es: 'Sordo', fr: 'Sourde', hi: 'हल्का लगातार', zh: '隐痛' },
    sentence: { en: 'It is a dull ache.', es: 'Es un dolor sordo.', fr: 'C’est une douleur sourde.', hi: 'हल्का लगातार दर्द है।', zh: '是隐隐作痛。' } },
  { key: 'burning', icon: 'flame', label: { en: 'Burning', es: 'Ardor', fr: 'Brûlure', hi: 'जलन', zh: '灼痛' },
    sentence: { en: 'It feels like burning.', es: 'Siento ardor.', fr: 'Ça brûle.', hi: 'जलन हो रही है।', zh: '有灼烧感。' } },
  { key: 'throbbing', icon: 'pulse', label: { en: 'Throbbing', es: 'Palpitante', fr: 'Lancinante', hi: 'धड़कता हुआ', zh: '跳痛' },
    sentence: { en: 'It is throbbing.', es: 'Es un dolor palpitante.', fr: 'Ça lance.', hi: 'दर्द धड़क रहा है।', zh: '一跳一跳地痛。' } },
  { key: 'cramping', icon: 'cramp', label: { en: 'Cramping', es: 'Cólico', fr: 'Crampes', hi: 'ऐंठन', zh: '绞痛' },
    sentence: { en: 'It feels like cramping.', es: 'Se siente como un cólico.', fr: 'Ce sont des crampes.', hi: 'ऐंठन हो रही है।', zh: '像绞痛一样。' } },
  { key: 'pressure', icon: 'pressure', label: { en: 'Pressure', es: 'Presión', fr: 'Pression', hi: 'दबाव', zh: '压迫感' },
    sentence: { en: 'It feels like pressure.', es: 'Siento presión.', fr: 'Je sens une pression.', hi: 'दबाव महसूस हो रहा है।', zh: '有压迫感。' } },
]

// ---------------- Core board (independent requests; works fully offline) ----------------
export type CoreItem = { id: string; icon: string; label: Record<Lang, string>; sentence: Record<Lang, string>; urgent?: boolean; flow?: 'pain' }
const ci = (id: string, icon: string, label: [string, string, string, string, string], sentence: [string, string, string, string, string], extra: Partial<CoreItem> = {}): CoreItem => ({
  id, icon, ...extra,
  label: { en: label[0], es: label[1], fr: label[2], hi: label[3], zh: label[4] },
  sentence: { en: sentence[0], es: sentence[1], fr: sentence[2], hi: sentence[3], zh: sentence[4] },
})
export const CORE_BOARD: CoreItem[] = [
  ci('pain', 'pain', ['I’m in pain', 'Tengo dolor', 'J’ai mal', 'मुझे दर्द है', '我很痛'], ['', '', '', '', ''], { flow: 'pain' }),
  ci('br-hard', 'breath', ['Hard to breathe', 'Me cuesta respirar', 'Du mal à respirer', 'साँस लेने में तकलीफ़', '呼吸困难'],
    ['It is hard to breathe.', 'Me cuesta respirar.', 'J’ai du mal à respirer.', 'मुझे साँस लेने में तकलीफ़ है।', '我呼吸困难。'], { urgent: true }),
  ci('ed-thirsty', 'water', ['Thirsty', 'Sed', 'Soif', 'प्यास', '口渴'],
    ['I am thirsty.', 'Tengo sed.', 'J’ai soif.', 'मुझे प्यास लगी है।', '我口渴。']),
  ci('hy-toilet', 'toilet', ['Toilet', 'Baño', 'Toilettes', 'शौचालय', '上厕所'],
    ['I need the toilet.', 'Necesito ir al baño.', 'J’ai besoin d’aller aux toilettes.', 'मुझे शौचालय जाना है।', '我需要上厕所。']),
  ci('cf-reposition', 'bed', ['Move me', 'Muévame', 'Changez ma position', 'मेरी स्थिति बदलें', '帮我翻身'],
    ['Please change my position.', 'Por favor, cámbieme de posición.', 'Pouvez-vous changer ma position, s’il vous plaît ?', 'कृपया मेरी स्थिति बदलें।', '请帮我换个姿势。']),
  ci('sym-cold', 'temp-cold', ['Cold', 'Frío', 'Froid', 'ठंड', '冷'],
    ['I feel cold.', 'Tengo frío.', 'J’ai froid.', 'मुझे ठंड लग रही है।', '我觉得冷。']),
  ci('fe-scared', 'scared', ['Scared', 'Miedo', 'Peur', 'डर', '害怕'],
    ['I feel scared.', 'Tengo miedo.', 'J’ai peur.', 'मुझे डर लग रहा है।', '我很害怕。']),
  ci('ur-nurse', 'nurse', ['Call nurse', 'Llamar enfermera', 'Appeler l’infirmière', 'नर्स बुलाएँ', '叫护士'],
    ['Please call the nurse.', 'Por favor, llame a la enfermera.', 'Appelez l’infirmière, s’il vous plaît.', 'कृपया नर्स को बुलाएँ।', '请叫护士。'], { urgent: true }),
  ci('fe-family', 'family', ['Family', 'Familia', 'Famille', 'परिवार', '家人'],
    ['I want to see my family.', 'Quiero ver a mi familia.', 'Je veux voir ma famille.', 'मैं अपने परिवार से मिलना चाहता/चाहती हूँ।', '我想见我的家人。']),
  ci('cf-sleep', 'sleep', ['Rest', 'Descansar', 'Me reposer', 'आराम', '休息'],
    ['I want to sleep.', 'Quiero dormir.', 'Je veux dormir.', 'मैं सोना चाहता/चाहती हूँ।', '我想睡觉。']),
  ci('q-simpler', 'question', ['Explain simpler', 'Más sencillo', 'Plus simplement', 'आसान शब्दों में', '说简单点'],
    ['Please explain more simply.', 'Por favor, explíquelo de forma más sencilla.', 'Expliquez plus simplement, s’il vous plaît.', 'कृपया आसान शब्दों में समझाएँ।', '请说得简单一点。']),
  ci('q-misunderstood', 'no', ['Not what I meant', 'No es lo que quise decir', 'Ce n’est pas ce que je voulais dire', 'मेरा मतलब यह नहीं था', '不是我的意思'],
    ['That is not what I meant.', 'Eso no es lo que quise decir.', 'Ce n’est pas ce que je voulais dire.', 'मेरा मतलब यह नहीं था।', '那不是我的意思。']),
]

export const QUICK_SENTENCE: Record<'yes' | 'no' | 'unsure', Record<Lang, string>> = {
  yes: { en: 'Yes.', es: 'Sí.', fr: 'Oui.', hi: 'हाँ।', zh: '是。' },
  no: { en: 'No.', es: 'No.', fr: 'Non.', hi: 'नहीं।', zh: '不是。' },
  unsure: { en: 'I am not sure.', es: 'No estoy seguro.', fr: 'Je ne suis pas sûr.', hi: 'मुझे पक्का नहीं पता।', zh: '我不确定。' },
}
export const HELP_SENTENCE: Record<Lang, string> = {
  en: 'I need help now.', es: 'Necesito ayuda ahora.', fr: 'J’ai besoin d’aide maintenant.', hi: 'मुझे अभी मदद चाहिए।', zh: '我现在需要帮助。',
}
