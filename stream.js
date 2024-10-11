import "dotenv/config";
import { Client } from "@xmtp/mls-client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { TextCodec } from "@xmtp/content-type-text";
import { toBytes } from "viem";
import { generatePrivateKey } from "viem/accounts";
import * as fs from "fs";

// Function to read messages from a conversation
async function readMessages(conversation) {
  const messages = await conversation.messages();
  return messages.map((msg) => ({
    sender: msg.senderInboxId,
    content: msg.content,
  }));
}

// Main function to listen for existing messages
async function main() {
  const wallet = await createWallet();
  const client = await setupClient(wallet);
  await registerClient(client, wallet);
  // Sync conversations and read messages from a specific conversation
  await client.conversations.sync();

  console.log("Started streaming messages");
  const stream = await client.conversations.streamAllMessages();
  for await (const message of stream) {
    console.log(`Streamed message: ${message.content}`);
  }
}

// Run the main function
main();

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
