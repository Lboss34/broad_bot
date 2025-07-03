const { analyzeMessage } = require('../utils/openai');
const { EmbedBuilder, PermissionsBitField, ActionRowBuilder, StringSelectMenuBuilder, Collection } = require('discord.js');
const config = require('../config.json');

// تخزين آخر وقت تم فيه إرسال رسالة لكل مستخدم
const lastBroadcastTime = new Map();

// دالة مساعدة لتجميع الأعضاء حسب الرتبة
async function getMembersWithRole(role) {
    const members = new Collection();
    await role.guild.members.fetch(); // تحديث قائمة الأعضاء
    role.members.forEach(member => {
        if (!member.user.bot) {
            members.set(member.id, member);
        }
    });
    return members;
}

async function handleBroadcast(message, args) {
    try {
        // التحقق من الصلاحيات
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return await message.reply('❌ عذراً، هذا الأمر متاح فقط للمشرفين.');
        }

        // التحقق من وجود رسالة للإرسال
        const broadcastMessage = args.join(' ');
        if (!broadcastMessage) {
            return await message.reply('⚠️ الرجاء كتابة رسالة للإرسال.');
        }

        // التحقق من وقت الانتظار
        const now = Date.now();
        const lastBroadcast = lastBroadcastTime.get(message.author.id) || 0;
        if (now - lastBroadcast < config.cooldown * 1000) {
            const remainingTime = Math.ceil((config.cooldown * 1000 - (now - lastBroadcast)) / 1000);
            return await message.reply(`⏳ الرجاء الانتظار ${remainingTime} ثانية قبل إرسال رسالة جديدة.`);
        }

        // تحليل الرسالة
        const statusMessage = await message.reply('🔍 جاري تحليل الرسالة...');
        const analysis = await analyzeMessage(broadcastMessage);

        if (analysis.error) {
            return await statusMessage.edit('❌ حدث خطأ أثناء تحليل الرسالة. الرجاء المحاولة مرة أخرى.');
        }

        // عرض نتائج التحليل في Embed
        const analysisEmbed = new EmbedBuilder()
            .setColor(analysis.isSpam ? '#ff0000' : analysis.isPromotional ? '#ffa500' : '#00ff00')
            .setTitle('📊 نتائج تحليل الرسالة')
            .addFields(
                { name: '🚫 محتوى مزعج', value: analysis.isSpam ? 'نعم' : 'لا', inline: true },
                { name: '📢 محتوى ترويجي', value: analysis.isPromotional ? 'نعم' : 'لا', inline: true },
                { name: '👔 نوع الرسالة', value: analysis.isFormal ? 'رسمية' : 'غير رسمية', inline: true }
            );

        if (analysis.reasons && analysis.reasons.length > 0) {
            analysisEmbed.addFields({ name: '📝 ملاحظات', value: analysis.reasons.join('\n') });
        }

        if (!analysis.shouldSend) {
            analysisEmbed.setDescription('⚠️ تحذير: هذه الرسالة قد تكون مزعجة. هل تريد المتابعة؟');
        }

        // إنشاء قائمة اختيار طريقة الإرسال
        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('broadcast_type')
                    .setPlaceholder('اختر طريقة الإرسال')
                    .addOptions([
                        {
                            label: 'إرسال لجميع الأعضاء',
                            description: 'إرسال الرسالة لجميع أعضاء السيرفر',
                            value: 'all',
                            emoji: '1️⃣'
                        },
                        {
                            label: 'إرسال لرتبة معينة',
                            description: 'اختيار رتبة محددة لإرسال الرسالة',
                            value: 'role',
                            emoji: '2️⃣'
                        },
                        {
                            label: 'إرسال في الخاص',
                            description: 'إرسال رسالة خاصة لجميع الأعضاء',
                            value: 'dm',
                            emoji: '3️⃣'
                        },
                        {
                            label: 'إرسال في روم معين',
                            description: 'اختيار روم محدد لإرسال الرسالة',
                            value: 'channel',
                            emoji: '4️⃣'
                        }
                    ])
            );

        await statusMessage.edit({
            embeds: [analysisEmbed],
            components: [row]
        });

        try {
            // انتظار اختيار المستخدم
            const interaction = await statusMessage.awaitMessageComponent({
                filter: (i) => i.user.id === message.author.id && i.customId === 'broadcast_type',
                time: 30000
            });

            let targetMembers = new Collection();
            let successCount = 0;
            let selectedRole = null;
            let selectedChannel = null;
            let isDM = false;

            switch(interaction.values[0]) {
                case 'all':
                    targetMembers = await message.guild.members.fetch();
                    break;

                case 'role':
                    // إنشاء قائمة بالرتب المتاحة
                    const roles = message.guild.roles.cache
                        .filter(role => role.name !== '@everyone' && role.position < message.guild.members.me.roles.highest.position)
                        .map(role => ({
                            label: role.name.length > 25 ? role.name.substring(0, 22) + '...' : role.name,
                            description: `${role.members.size} عضو`,
                            value: role.id
                        }))
                        .slice(0, 25);

                    if (roles.length === 0) {
                        await interaction.update({ content: '❌ لا توجد رتب متاحة للإرسال.', components: [] });
                        return;
                    }

                    const roleRow = new ActionRowBuilder()
                        .addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('role_select')
                                .setPlaceholder('اختر الرتبة')
                                .addOptions(roles)
                        );

                    await interaction.update({
                        content: '👥 اختر الرتبة المطلوبة:',
                        components: [roleRow],
                        embeds: []
                    });

                    try {
                        const roleInteraction = await statusMessage.awaitMessageComponent({
                            filter: (i) => i.user.id === message.author.id && i.customId === 'role_select',
                            time: 30000
                        });

                        selectedRole = message.guild.roles.cache.get(roleInteraction.values[0]);
                        if (!selectedRole) {
                            await roleInteraction.update({ content: '❌ لم يتم العثور على الرتبة المحددة.', components: [] });
                            return;
                        }

                        // تحديث قائمة الأعضاء للرتبة المحددة
                        targetMembers = await getMembersWithRole(selectedRole);
                        
                        if (targetMembers.size === 0) {
                            await roleInteraction.update({ 
                                content: '⚠️ لا يوجد أعضاء في هذه الرتبة أو جميعهم بوتات.',
                                components: []
                            });
                            return;
                        }

                        // إضافة خيار لطريقة الإرسال
                        const sendMethodRow = new ActionRowBuilder()
                            .addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('send_method')
                                    .setPlaceholder('اختر طريقة الإرسال')
                                    .addOptions([
                                        {
                                            label: 'إرسال في الخاص',
                                            description: 'إرسال رسالة خاصة لكل عضو',
                                            value: 'dm',
                                            emoji: '📩'
                                        },
                                        {
                                            label: 'إرسال في القناة الحالية',
                                            description: 'منشن للرتبة مع الرسالة',
                                            value: 'channel',
                                            emoji: '📢'
                                        }
                                    ])
                            );

                        await roleInteraction.update({
                            content: `✅ تم اختيار رتبة ${selectedRole.name} (${targetMembers.size} عضو)\nاختر طريقة الإرسال:`,
                            components: [sendMethodRow]
                        });

                        const methodInteraction = await statusMessage.awaitMessageComponent({
                            filter: (i) => i.user.id === message.author.id && i.customId === 'send_method',
                            time: 30000
                        });

                        isDM = methodInteraction.values[0] === 'dm';
                        await methodInteraction.update({
                            content: '📤 جاري إرسال الرسائل...',
                            components: []
                        });

                    } catch (error) {
                        console.error('خطأ في اختيار الرتبة:', error);
                        await interaction.editReply({ content: '⏳ انتهى وقت الاختيار.', components: [] });
                        return;
                    }
                    break;

                case 'dm':
                    targetMembers = await message.guild.members.fetch();
                    isDM = true;
                    break;

                case 'channel':
                    // إنشاء قائمة بالرومات المتاحة
                    const channels = message.guild.channels.cache
                        .filter(channel => 
                            channel.type === 0 && // TextChannel
                            channel.permissionsFor(message.guild.members.me).has(PermissionsBitField.Flags.SendMessages)
                        )
                        .map(channel => ({
                            label: channel.name.length > 25 ? channel.name.substring(0, 22) + '...' : channel.name,
                            description: channel.parent ? `${channel.parent.name}` : 'بدون قسم',
                            value: channel.id
                        }))
                        .slice(0, 25);

                    if (channels.length === 0) {
                        await interaction.update({ content: '❌ لا توجد رومات متاحة للإرسال.', components: [] });
                        return;
                    }

                    const channelRow = new ActionRowBuilder()
                        .addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('channel_select')
                                .setPlaceholder('اختر الروم')
                                .addOptions(channels)
                        );

                    await interaction.update({
                        content: '📝 اختر الروم المطلوب:',
                        components: [channelRow],
                        embeds: []
                    });

                    try {
                        const channelInteraction = await statusMessage.awaitMessageComponent({
                            filter: (i) => i.user.id === message.author.id && i.customId === 'channel_select',
                            time: 30000
                        });

                        selectedChannel = message.guild.channels.cache.get(channelInteraction.values[0]);
                        if (!selectedChannel) {
                            await channelInteraction.update({ content: '❌ لم يتم العثور على الروم المحدد.', components: [] });
                            return;
                        }

                        await channelInteraction.update({ content: '✅ تم اختيار الروم بنجاح.', components: [] });
                    } catch (error) {
                        await interaction.editReply({ content: '⏳ انتهى وقت الاختيار.', components: [] });
                        return;
                    }
                    break;
            }

            // إرسال الرسائل
            const sendingMessage = await message.channel.send('📤 جاري إرسال الرسائل...');
            const failedMembers = new Set();

            if (selectedChannel) {
                try {
                    await selectedChannel.send({
                        content: broadcastMessage,
                        allowedMentions: { parse: ['users', 'roles'] }
                    });
                    successCount = 1;
                } catch (error) {
                    console.error('خطأ في إرسال الرسالة للروم:', error);
                    await sendingMessage.edit('❌ حدث خطأ أثناء إرسال الرسالة للروم.');
                    return;
                }
            } else {
                // إرسال للأعضاء
                const totalMembers = targetMembers.size;
                let currentMember = 0;

                for (const [, member] of targetMembers) {
                    try {
                        if (!member.user.bot) {
                            if (isDM) {
                                try {
                                    await member.send(broadcastMessage);
                                    successCount++;
                                } catch (dmError) {
                                    failedMembers.add(member.user.tag);
                                    console.error(`فشل إرسال رسالة خاصة إلى ${member.user.tag}:`, dmError);
                                }
                            } else {
                                await message.channel.send({
                                    content: `${selectedRole ? `<@&${selectedRole.id}> ` : ''}${broadcastMessage}`,
                                    allowedMentions: { parse: ['users', 'roles'] }
                                });
                                successCount = targetMembers.size; // في حالة الإرسال في القناة، نعتبر أن الرسالة وصلت للجميع
                                break; // نخرج من الحلقة لأننا نحتاج فقط لإرسال رسالة واحدة
                            }
                        }
                        
                        // تحديث رسالة التقدم كل 5 أعضاء
                        currentMember++;
                        if (currentMember % 5 === 0 || currentMember === totalMembers) {
                            await sendingMessage.edit(`📤 جاري الإرسال... ${currentMember}/${totalMembers}`);
                        }
                    } catch (error) {
                        console.error(`فشل إرسال الرسالة إلى ${member.user.tag}:`, error);
                        failedMembers.add(member.user.tag);
                    }

                    // تأخير صغير بين الرسائل لتجنب التحديد
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // تحديث وقت آخر برودكاست
            lastBroadcastTime.set(message.author.id, Date.now());

            // تسجيل العملية
            const logChannel = message.guild.channels.cache.find(channel => 
                channel.name === config.logChannel
            );

            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('📢 سجل البرودكاست')
                    .addFields(
                        { name: 'المرسل', value: message.author.tag, inline: true },
                        { name: 'نوع الإرسال', value: `${isDM ? 'رسائل خاصة' : 'قناة عامة'}`, inline: true },
                        { name: 'عدد المستلمين', value: successCount.toString(), inline: true }
                    )
                    .setDescription(broadcastMessage)
                    .setTimestamp();

                if (selectedRole) {
                    logEmbed.addFields({ name: 'الرتبة المستهدفة', value: selectedRole.name });
                }
                if (selectedChannel) {
                    logEmbed.addFields({ name: 'الروم المستهدف', value: selectedChannel.name });
                }
                if (failedMembers.size > 0) {
                    logEmbed.addFields({ 
                        name: '❌ الأعضاء الذين لم يستلموا الرسالة', 
                        value: Array.from(failedMembers).slice(0, 10).join('\n') + 
                              (failedMembers.size > 10 ? `\n... و${failedMembers.size - 10} آخرين` : '')
                    });
                }

                await logChannel.send({ embeds: [logEmbed] });
            }

            let finalMessage = `📬 تم إرسال الرسالة بنجاح ${
                selectedChannel ? `في الروم ${selectedChannel.name}` :
                selectedRole ? `لـ ${successCount} عضو من رتبة ${selectedRole.name}` :
                `إلى ${successCount} عضو`
            }`;

            if (failedMembers.size > 0) {
                finalMessage += `\n⚠️ تعذر الإرسال إلى ${failedMembers.size} عضو (غالباً بسبب إغلاق الرسائل الخاصة)`;
            }

            return sendingMessage.edit({ content: finalMessage });

        } catch (error) {
            console.error('خطأ في معالجة البرودكاست:', error);
            if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
                return await message.reply('⏳ انتهى وقت الاختيار. تم إلغاء العملية.');
            }
            return await message.reply('❌ حدث خطأ أثناء تنفيذ العملية.');
        }
    } catch (error) {
        console.error('خطأ في معالجة البرودكاست:', error);
        return await message.reply('❌ حدث خطأ أثناء تنفيذ العملية.');
    }
}

module.exports = { handleBroadcast }; 