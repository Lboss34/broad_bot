require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const { handleBroadcast } = require('./commands/broadcast');
const { handleHelp } = require('./commands/help');
const config = require('./config.json');

// إنشاء عميل Discord مع الصلاحيات المطلوبة
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction
    ]
});

// عند جاهزية البوت
client.once(Events.ClientReady, () => {
    console.log(`🤖 تم تشغيل البوت بنجاح: ${client.user.tag}`);
    client.user.setActivity('برودكاست | -help', { type: 'WATCHING' });
});

// معالجة الرسائل
client.on(Events.MessageCreate, async message => {
    // تجاهل رسائل البوت
    if (message.author.bot) return;

    // التحقق من البادئة
    if (!message.content.startsWith(config.prefix)) return;

    // تقسيم الرسالة إلى أجزاء
    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // التحقق من الأمر
    try {
        if (config.broadcastCommands.includes(command)) {
            await handleBroadcast(message, args).catch(console.error);
        } else if (command === config.helpCommand) {
            await handleHelp(message).catch(console.error);
        }
    } catch (error) {
        console.error('خطأ في تنفيذ الأمر:', error);
        await message.channel.send('❌ حدث خطأ أثناء تنفيذ الأمر.').catch(console.error);
    }
});

// تسجيل الدخول للبوت
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('❌ خطأ في تسجيل دخول البوت:', error);
}); 