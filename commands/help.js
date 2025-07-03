const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

async function handleHelp(message) {
    try {
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🤖 قائمة أوامر البوت')
            .setDescription('مرحباً! إليك قائمة بجميع الأوامر المتاحة:')
            .addFields(
                { 
                    name: `${config.prefix}bc [الرسالة]`, 
                    value: 'إرسال رسالة جماعية (برودكاست) مع تحليل ذكي للمحتوى\n' +
                          '```مثال: -bc مرحباً بالجميع!```' 
                },
                { 
                    name: `${config.prefix}broadcast [الرسالة]`, 
                    value: 'نفس الأمر السابق (اختصار آخر)\n' +
                          '```مثال: -broadcast مرحباً بالجميع!```'
                },
                {
                    name: '📝 خيارات الإرسال',
                    value: '1️⃣ إرسال لجميع الأعضاء\n' +
                          '2️⃣ إرسال لرتبة معينة\n' +
                          '3️⃣ إرسال في الخاص\n' +
                          '4️⃣ إرسال في روم معين'
                },
                {
                    name: '⚙️ معلومات إضافية',
                    value: '• يجب أن تكون مشرف لاستخدام أوامر البرودكاست\n' +
                          `• فترة الانتظار بين الرسائل: ${config.cooldown} ثانية\n` +
                          `• قناة السجلات: #${config.logChannel}`
                }
            )
            .setFooter({ 
                text: 'تم تطوير البوت بواسطة فريقك', 
                iconURL: message.client.user.displayAvatarURL() 
            })
            .setTimestamp();

        // إرسال رسالة واحدة فقط
        return await message.channel.send({ embeds: [helpEmbed] });
    } catch (error) {
        console.error('خطأ في عرض قائمة المساعدة:', error);
        return await message.channel.send('❌ حدث خطأ أثناء عرض قائمة المساعدة.');
    }
}

module.exports = { handleHelp }; 