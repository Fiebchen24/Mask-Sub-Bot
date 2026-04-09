require('dotenv').config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { subscriptionModels } = require('./config');

const modelChoices = Object.values(subscriptionModels).map(model => ({
  name: model.label,
  value: model.key
}));

const commands = [
  new SlashCommandBuilder()
    .setName('sub-add')
    .setDescription('Activate a subscription for a user')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User who should receive the subscription')
        .setRequired(true)
    )
    .addStringOption(option => {
      option
        .setName('model')
        .setDescription('Subscription model')
        .setRequired(true);

      for (const choice of modelChoices) {
        option.addChoices(choice);
      }

      return option;
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('sub-set')
    .setDescription('Set a subscription to a fixed number of days from now')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User whose subscription should be set')
        .setRequired(true)
    )
    .addStringOption(option => {
      option
        .setName('model')
        .setDescription('Subscription model')
        .setRequired(true);

      for (const choice of modelChoices) {
        option.addChoices(choice);
      }

      return option;
    })
    .addIntegerOption(option =>
      option
        .setName('days')
        .setDescription('Number of days from now')
        .setRequired(true)
        .setMinValue(1)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('sub-extend')
    .setDescription('Extend a subscription for a user')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User whose subscription should be extended')
        .setRequired(true)
    )
    .addStringOption(option => {
      option
        .setName('model')
        .setDescription('Subscription model')
        .setRequired(true);

      for (const choice of modelChoices) {
        option.addChoices(choice);
      }

      return option;
    })
    .addIntegerOption(option =>
      option
        .setName('days')
        .setDescription('Number of days to extend the subscription')
        .setRequired(true)
        .setMinValue(1)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('sub-remove')
    .setDescription('Remove a subscription from a user')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User whose subscription should be removed')
        .setRequired(true)
    )
    .addStringOption(option => {
      option
        .setName('model')
        .setDescription('Subscription model')
        .setRequired(true);

      for (const choice of modelChoices) {
        option.addChoices(choice);
      }

      return option;
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('sub-list')
    .setDescription('Show all active subscriptions')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('sub-check')
    .setDescription('Run a manual expiration check')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log('Slash commands registered successfully.');
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
})();