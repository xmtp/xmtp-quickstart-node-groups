import "dotenv/config";
import { Client } from "@xmtp/mls-client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { TextCodec } from "@xmtp/content-type-text";
import { toBytes } from "viem";
import { generatePrivateKey } from "viem/accounts";
import * as fs from "fs";

// Function to set up a client for a given private key
async function setupClient(privateKey) {
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({
    account,
    chain: mainnet,
    transport: http(),
  });

  if (!fs.existsSync(`.data`)) {
    fs.mkdirSync(`.data`);
  }

  const defaultConfig = {
    env: "production",
    dbPath: `.data/${account.address}-production`,
    codecs: [new TextCodec()],
  };
  const client = await Client.create(account.address, defaultConfig);

  // Register identity if not already registered
  if (!client.isRegistered && client.signatureText) {
    const signature = await wallet.signMessage({
      message: client.signatureText,
    });
    const signatureBytes = toBytes(signature);
    client.addEcdsaSignature(signatureBytes);
    await client.registerIdentity();
  }

  return { client, wallet };
}

// Function to create a group conversation
async function createGroupConversation(client, members) {
  //console.log("Creating group conversation with members:", members);
  await client.conversations.sync();
  const conversation = await client.conversations.newConversation(members);
  //console.log(`Created group conversation with ID: ${conversation.id}`);
  return conversation;
}

// Function to add a member to a group conversation
async function addMemberToGroup(client, conversation, newMember) {
  await client.conversations.sync();
  const conversation = await client.conversations.newConversation(members);
  await conversation.addMembers([newMember]);
  //console.log(`Added member ${newMember} to conversation ${conversation.id}`);
}

// Function to remove a member from a group conversation
async function removeMemberFromGroup(conversation, member) {
  await conversation.removeMembers([member]);
  //console.log(`Removed member ${member} from conversation ${conversation.id}`);
}

// Function to send a message in a conversation
async function sendMessage(client, conversationId, content) {
  await client.conversations.sync();
  const conversation = await client.conversations.getConversationById(
    conversationId,
  );
  await conversation.send(content);

  //console.log(`Message sent by ${senderAddress}: "${content}"`);
}

// Function to read messages from a conversation
async function readMessages(conversation) {
  const messages = await conversation.messages();
  return messages.map((msg) => ({
    sender: msg.senderInboxId,
    content: msg.content,
  }));
}

// Function to test if all users can read all messages and have the same amount of messages
async function testMessageReadability(users, conversation) {
  let messageCount = null;
  const userMessageCounts = [];

  for (const user of users) {
    try {
      await user.client.conversations.sync();
      const userConversation =
        await user.client.conversations.getConversationById(conversation.id);
      const messages = await readMessages(userConversation);
      userMessageCounts.push({
        user: user.client.accountAddress,
        messageCount: messages.length,
      });
    } catch (error) {
      console.error(
        `Error reading messages for ${user.client.accountAddress}:`,
        error,
      );
    }
  }
  console.log(userMessageCounts);
  return true;
}

// Main function to run the test setup
async function main() {
  // Generate private keys for participants
  const keys = Array.from({ length: 10 }, () => generatePrivateKey());

  // Set up clients for each participant
  const users = await Promise.all(
    keys.map(async (key) => {
      const { client, wallet } = await setupClient(key);
      return { client, wallet };
    }),
  );

  const members = users.slice(1).map((user) => user.client.accountAddress);

  // Create a group conversation
  const conversation = await createGroupConversation(users[0].client, [
    members[0],
    members[1],
  ]);
  // Send a message to the group as the first user
  await sendMessage(users[0].client, conversation.id, "Hello, group!");

  // Add a new message from each user
  for (let i = 1; i < users.length; i++) {
    await addMemberToGroup(client, conversation, members[i]);

    await sendMessage(
      users[i].client,
      conversation.id,
      `Message from user ${i + 1}`,
    );

    // Add a new member after the 5th message
    if (i === 5) {
      await conversation.updateName(`Group ${i + 1}`);
    }
  }

  const allMessagesRead = await testMessageReadability(users, conversation);
  console.log(allMessagesRead);
  process.exit(0);
}

// Run the test setup
main();
