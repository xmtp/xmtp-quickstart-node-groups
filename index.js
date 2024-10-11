import "dotenv/config";
import { Client } from "@xmtp/mls-client";
import * as fs from "fs";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { toBytes } from "viem";
import { generatePrivateKey } from "viem/accounts";

// Function to send a message to a specific group
async function sendMessageToGroup(client, groupId, messageContent) {
  const conversation = client.conversations.getConversationById(groupId);
  if (!conversation) {
    console.log(`No conversation found with ID: ${groupId}`);
    return;
  }
  await conversation.send(messageContent);
  console.log(`Message sent to group ${groupId}: ${messageContent}`);
}

// Function to create a wallet from a private key
async function createWallet() {
  let key = process.env.KEY;
  if (!key) {
    key = generatePrivateKey();
    console.error(
      "KEY not set. Using random one. For using your own wallet , set the KEY environment variable.",
    );
    console.log("Random private key: ", key);
  }

  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({
    account,
    chain: mainnet,
    transport: http(),
  });
  console.log(`Init wallet ${account.address}`);
  return wallet;
}

// Function to create and setup the XMTP client
async function setupClient(wallet, config = {}) {
  let initialConfig = {
    env: "production",
  };
  const finalConfig = { ...initialConfig, ...config };

  const client = await Client.create(wallet.account?.address, finalConfig);
  console.log("Inbox id: ", client.inboxId);
  return client;
}

// Function to register the client if not already registered
async function registerClient(client, wallet) {
  // register identity
  if (!client.isRegistered && client.signatureText) {
    const signatureText = await client.signatureText();
    if (signatureText) {
      const signature = await wallet.signMessage({
        message: signatureText,
      });
      const signatureBytes = toBytes(signature);
      if (signatureBytes) {
        client.addSignature(signatureBytes);
      }
    }

    await client.registerIdentity();
  }
}

// Function to handle conversations
async function handleConversations(client) {
  await client.conversations.sync();
  const conversations = await client.conversations.list();
  console.log(`Total conversations: ${conversations.length}`);
  for (const conv of conversations) {
    console.log(`Handling conversation with ID: ${conv.id}`);
    await conv.sync();
    const messages = await conv.messages();
    console.log(`Total messages in conversation: ${messages.length}`);
    for (let i = 0; i < messages.length; i++) {
      console.log(`Message ${i}: ${messages[i].content}`);
    }
  }
}
// Function to stream all messages and respond to new ones
async function streamAndRespond(client) {
  console.log("Started streaming messages");
  const stream = await client.conversations.streamAllMessages();
  for await (const message of stream) {
    console.log(`Streamed message: ${message.content}`);
    if (message.senderInboxId !== client.inboxId) {
      sendMessageToGroup(client, message.conversationId, "gm");
    }
  }
}
async function createGroupConversation(client) {
  const conversation = await client.conversations.newConversation([
    "0x277C0dd35520dB4aaDDB45d4690aB79353D3368b",
    "0x13956e5424b9ce4E6C3ca8C070AFff329B371784",
  ]);
  console.log(conversation.id);
}
// Main function to run the application
async function main() {
  // Create a new wallet instance
  const wallet = await createWallet();
  // Set up the XMTP client with the wallet and database path
  if (!fs.existsSync(`.cache`)) {
    fs.mkdirSync(`.cache`);
  }
  const client = await setupClient(wallet, {
    dbPath: `.cache/${wallet.account?.address}-${"prod"}`,
  });
  // Register the client with the XMTP network if not already registered
  await registerClient(client, wallet);
  // Handle existing conversations
  await handleConversations(client);
  // Run message streaming in a parallel thread to respond to new messages
  (async () => {
    await streamAndRespond(client);
  })();
}
// Example usage
main();
