const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// تخزين مؤقت للتحليلات السابقة
const analysisCache = new Map();
const CACHE_DURATION = 1000 * 60 * 60; // ساعة واحدة

// تحسين التحليل المحلي للرسائل
function localAnalyzeMessage(text) {
    const spamPatterns = {
        discordInvites: /discord\.gg\/|discord\.com\/invite/i,
        urls: /(https?:\/\/[^\s]+)/g,
        repetitiveChars: /(.)\1{4,}/,
        promotionalWords: /(اشترك|جوين|انضم|اربح|خصم|تخفيض|عرض|offer|join|subscribe|win|discount)/i,
        spamWords: /(spam|اعلان|تسويق|ادفع|اشتري|مجاناً|free|buy|offer|urgent|عاجل|حصري|exclusive)/i
    };

    const formalPatterns = {
        greetings: /(السلام عليكم|مرحبا|تحية|شكراً|مع تحياتي|regards|dear|hello|hi)/i,
        formalWords: /(نود|يسرنا|يشرفنا|نتشرف|we are pleased|we would like|sincerely)/i,
        properPunctuation: /[.!؟،,][\s\n]/
    };

    // تحليل النص
    const analysis = {
        isSpam: false,
        isPromotional: false,
        isFormal: false,
        reasons: []
    };

    // فحص الروابط والدعوات
    if (spamPatterns.discordInvites.test(text)) {
        analysis.isPromotional = true;
        analysis.reasons.push("يحتوي على رابط دعوة ديسكورد");
    }

    if ((text.match(spamPatterns.urls) || []).length > 2) {
        analysis.isSpam = true;
        analysis.reasons.push("يحتوي على عدة روابط");
    }

    // فحص التكرار
    if (spamPatterns.repetitiveChars.test(text)) {
        analysis.isSpam = true;
        analysis.reasons.push("يحتوي على حروف متكررة بشكل مفرط");
    }

    // فحص الكلمات الترويجية
    if (spamPatterns.promotionalWords.test(text)) {
        analysis.isPromotional = true;
        analysis.reasons.push("يحتوي على كلمات ترويجية");
    }

    if (spamPatterns.spamWords.test(text)) {
        analysis.isSpam = true;
        analysis.reasons.push("يحتوي على كلمات إعلانية");
    }

    // فحص الرسمية
    if (formalPatterns.greetings.test(text)) {
        analysis.isFormal = true;
    }

    if (formalPatterns.formalWords.test(text)) {
        analysis.isFormal = true;
    }

    if (formalPatterns.properPunctuation.test(text)) {
        analysis.isFormal = true;
    }

    return {
        isSpam: analysis.isSpam,
        isPromotional: analysis.isPromotional,
        isFormal: analysis.isFormal,
        fullAnalysis: analysis.reasons.join("، ") || "رسالة عادية",
        shouldSend: !analysis.isSpam,
        reasons: analysis.reasons
    };
}

async function analyzeMessage(message) {
    try {
        // التحقق من وجود تحليل مخزن مؤقتاً
        const cachedAnalysis = analysisCache.get(message);
        if (cachedAnalysis && Date.now() - cachedAnalysis.timestamp < CACHE_DURATION) {
            return cachedAnalysis.result;
        }

        // تحليل محلي أولاً
        const localAnalysis = localAnalyzeMessage(message);

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: `أنت محلل محتوى متخصص في تقييم الرسائل في Discord. عليك تحليل الرسالة وتصنيفها بدقة.
                        يجب اعتبار الرسالة ترويجية إذا:
                        - تحتوي على روابط دعوة Discord
                        - تحتوي على عبارات تشجع على الانضمام لسيرفرات
                        - تحتوي على عروض أو تخفيضات
                        - تستخدم أسلوب التسويق المباشر`
                    },
                    {
                        role: "user",
                        content: `تحليل الرسالة التالية بدقة:\n${message}`
                    }
                ],
                temperature: 0.7,
                max_tokens: 200
            });

            const aiAnalysis = response.choices[0].message.content;
            
            // دمج التحليل المحلي مع تحليل AI
            const result = {
                isSpam: localAnalysis.isSpam || aiAnalysis.toLowerCase().includes("spam") || aiAnalysis.toLowerCase().includes("مزعج"),
                isPromotional: localAnalysis.isPromotional || aiAnalysis.toLowerCase().includes("تسويق") || aiAnalysis.toLowerCase().includes("إعلان") || aiAnalysis.toLowerCase().includes("ترويج"),
                isFormal: localAnalysis.isFormal || aiAnalysis.toLowerCase().includes("رسمي"),
                fullAnalysis: localAnalysis.reasons.length > 0 ? 
                    `${localAnalysis.reasons.join("، ")}\n${aiAnalysis}` : aiAnalysis,
                shouldSend: !(localAnalysis.isSpam || aiAnalysis.toLowerCase().includes("spam")),
                reasons: localAnalysis.reasons
            };

            // تخزين النتيجة في الذاكرة المؤقتة
            analysisCache.set(message, {
                result,
                timestamp: Date.now()
            });

            return result;
        } catch (apiError) {
            console.error('خطأ في API OpenAI، استخدام التحليل المحلي فقط:', apiError);
            
            // تخزين نتيجة التحليل المحلي
            analysisCache.set(message, {
                result: localAnalysis,
                timestamp: Date.now()
            });
            
            return localAnalysis;
        }
    } catch (error) {
        console.error('خطأ في تحليل الرسالة:', error);
        return {
            error: true,
            message: 'حدث خطأ أثناء تحليل الرسالة'
        };
    }
}

module.exports = { analyzeMessage }; 