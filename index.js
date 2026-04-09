require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField
} = require('discord.js');
const Database = require('better-sqlite3');
const cron = require('node-cron');
const { subscriptionModels } = require('./config');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const db = new Database('./subscriptions.db');

db.prepare(`
  CREATE TABLE IF NOT EXISTS subs (
    guild TEXT NOT NULL,
    user TEXT NOT NULL,
    model TEXT NOT NULL,
    expires INTEGER NOT NULL,
    PRIMARY KEY (guild, user, model)
  )
`).run();

function getModel(key) {
  return subscriptionModels[key] || null;
}

function formatDiscordTimestamp(ms) {
  return `<t:${Math.floor(ms / 1000)}:F>`;
}

function canManageRole(guild, role) {
  const botMember = guild.members.me;
  if (!botMember || !role) return false;

  return (
    botMember.permissions.has(PermissionsBitField.Flags.ManageRoles) &&
    botMember.roles.highest.position > role.position
  );
}

async function removeExpiredSubscriptions() {
  const now = Date.now();
  const rows = db.prepare(`SELECT * FROM subs WHERE expires <= ?`).all(now);

  for (const row of rows) {
    try {
      const guild = await client.guilds.fetch(row.guild).catch(() => null);
      if (!guild) {
        db.prepare(`DELETE FROM subs WHERE guild = ? AND user = ? AND model = ?`)
          .run(row.guild, row.user, row.model);
        continue;
      }

      const member = await guild.members.fetch(row.user).catch(() => null);
      const model = getModel(row.model);

      if (!model) {
        db.prepare(`DELETE FROM subs WHERE guild = ? AND user = ? AND model = ?`)
          .run(row.guild, row.user, row.model);
        continue;
      }

      const role = await guild.roles.fetch(model.roleId).catch(() => null);

      if (member && role && member.roles.cache.has(role.id) && canManageRole(guild, role)) {
        await member.roles.remove(role, 'Subscription expired');
      }

      db.prepare(`DELETE FROM subs WHERE guild = ? AND user = ? AND model = ?`)
        .run(row.guild, row.user, row.model);
    } catch (error) {
      console.error('Error removing expired subscription:', error);
    }
  }
}

client.once('ready', async () => {
  console.log(`Bot ready as ${client.user.tag}`);

  await removeExpiredSubscriptions();

  cron.schedule('* * * * *', async () => {
    await removeExpiredSubscriptions();
  });
});

client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;

  try {
    if (i.commandName === 'sub-add') {
      const user = i.options.getUser('user');
      const model = getModel(i.options.getString('model'));

      if (!model) {
        return i.reply({ content: 'Invalid subscription model.', ephemeral: true });
      }

      const member = await i.guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        return i.reply({ content: 'User is not in this server.', ephemeral: true });
      }

      const role = await i.guild.roles.fetch(model.roleId).catch(() => null);
      if (!role) {
        return i.reply({ content: 'Subscription role not found.', ephemeral: true });
      }

      if (!canManageRole(i.guild, role)) {
        return i.reply({
          content: 'I cannot manage this role. Move the bot role above the subscription role and make sure it has Manage Roles.',
          ephemeral: true
        });
      }

      await member.roles.add(role, 'Subscription activated');

      const expires = Date.now() + model.durationDays * 24 * 60 * 60 * 1000;

      db.prepare(`
        INSERT OR REPLACE INTO subs (guild, user, model, expires)
        VALUES (?, ?, ?, ?)
      `).run(i.guild.id, user.id, model.key, expires);

      return i.reply({
        content: `✅ ${user.tag} received **${model.label}** until ${formatDiscordTimestamp(expires)}`,
        ephemeral: true
      });
    }

    if (i.commandName === 'sub-set') {
      const user = i.options.getUser('user');
      const model = getModel(i.options.getString('model'));
      const days = i.options.getInteger('days');

      if (!model) {
        return i.reply({ content: 'Invalid subscription model.', ephemeral: true });
      }

      const member = await i.guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        return i.reply({ content: 'User is not in this server.', ephemeral: true });
      }

      const role = await i.guild.roles.fetch(model.roleId).catch(() => null);
      if (!role) {
        return i.reply({ content: 'Subscription role not found.', ephemeral: true });
      }

      if (!canManageRole(i.guild, role)) {
        return i.reply({
          content: 'I cannot manage this role. Move the bot role above the subscription role and make sure it has Manage Roles.',
          ephemeral: true
        });
      }

      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role, 'Subscription set');
      }

      const expires = Date.now() + days * 24 * 60 * 60 * 1000;

      db.prepare(`
        INSERT OR REPLACE INTO subs (guild, user, model, expires)
        VALUES (?, ?, ?, ?)
      `).run(i.guild.id, user.id, model.key, expires);

      return i.reply({
        content: `🗓️ ${user.tag} was set to **${model.label}** for **${days} days**. Expires: ${formatDiscordTimestamp(expires)}`,
        ephemeral: true
      });
    }

    if (i.commandName === 'sub-extend') {
      const user = i.options.getUser('user');
      const model = getModel(i.options.getString('model'));
      const days = i.options.getInteger('days');

      if (!model) {
        return i.reply({ content: 'Invalid subscription model.', ephemeral: true });
      }

      const existing = db.prepare(`
        SELECT * FROM subs
        WHERE guild = ? AND user = ? AND model = ?
      `).get(i.guild.id, user.id, model.key);

      if (!existing) {
        return i.reply({
          content: 'No active subscription found for that user and model.',
          ephemeral: true
        });
      }

      const role = await i.guild.roles.fetch(model.roleId).catch(() => null);
      if (!role) {
        return i.reply({ content: 'Subscription role not found.', ephemeral: true });
      }

      const member = await i.guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        return i.reply({ content: 'User is not in this server.', ephemeral: true });
      }

      if (!canManageRole(i.guild, role)) {
        return i.reply({
          content: 'I cannot manage this role. Move the bot role above the subscription role and make sure it has Manage Roles.',
          ephemeral: true
        });
      }

      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role, 'Subscription extended');
      }

      const baseTime = existing.expires > Date.now() ? existing.expires : Date.now();
      const newExpires = baseTime + days * 24 * 60 * 60 * 1000;

      db.prepare(`
        UPDATE subs
        SET expires = ?
        WHERE guild = ? AND user = ? AND model = ?
      `).run(newExpires, i.guild.id, user.id, model.key);

      return i.reply({
        content: `🔄 ${user.tag} was extended by **${days} days**. New expiry: ${formatDiscordTimestamp(newExpires)}`,
        ephemeral: true
      });
    }

    if (i.commandName === 'sub-remove') {
      const user = i.options.getUser('user');
      const model = getModel(i.options.getString('model'));

      if (!model) {
        return i.reply({ content: 'Invalid subscription model.', ephemeral: true });
      }

      const member = await i.guild.members.fetch(user.id).catch(() => null);
      const role = await i.guild.roles.fetch(model.roleId).catch(() => null);

      if (member && role && member.roles.cache.has(role.id) && canManageRole(i.guild, role)) {
        await member.roles.remove(role, 'Subscription removed');
      }

      db.prepare(`
        DELETE FROM subs
        WHERE guild = ? AND user = ? AND model = ?
      `).run(i.guild.id, user.id, model.key);

      return i.reply({
        content: `❌ Removed **${model.label}** from ${user.tag}`,
        ephemeral: true
      });
    }

    if (i.commandName === 'sub-list') {
      const rows = db.prepare(`
        SELECT * FROM subs
        WHERE guild = ?
        ORDER BY expires ASC
      `).all(i.guild.id);

      if (!rows.length) {
        return i.reply({
          content: 'No active subscriptions found.',
          ephemeral: true
        });
      }

      const lines = rows.slice(0, 25).map(row => {
        const model = getModel(row.model);
        const modelName = model ? model.label : row.model;
        return `• <@${row.user}> — **${modelName}** — expires ${formatDiscordTimestamp(row.expires)}`;
      });

      const embed = new EmbedBuilder()
        .setTitle('Active Subscriptions')
        .setDescription(lines.join('\n'));

      if (rows.length > 25) {
        embed.setFooter({ text: `Showing 25 of ${rows.length} subscriptions` });
      }

      return i.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    if (i.commandName === 'sub-check') {
      await i.deferReply({ ephemeral: true });
      await removeExpiredSubscriptions();
      return i.editReply('Manual subscription check completed.');
    }
  } catch (error) {
    console.error('Interaction error:', error);

    if (i.deferred || i.replied) {
      await i.editReply('There was an error while processing that command.').catch(() => {});
    } else {
      await i.reply({
        content: 'There was an error while processing that command.',
        ephemeral: true
      }).catch(() => {});
    }
  }
});

client.login(process.env.TOKEN);