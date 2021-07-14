require("dotenv").config();

//set the enviornment variables in a .env file
const {
  DISCORD_TOKEN,
  DISCORD_CHANNEL_NAME,
  DISCORD_CHANNEL_MAINNET_NAME,
  XDAI_WS_PROVIDER,
  MAINNET_WS_PROVIDER,
} = process.env;

//Initial xDai/blockchain code by @brunitob
const Web3 = require("web3");
const PoapAbi = require("./poap.json");
const POAP_XDAI_CONTRACT = "0x22C1f6050E56d2876009903609a2cC3fEf83B415";
const ZEROX = "0x0000000000000000000000000000000000000000";

const { default: axios } = require("axios");
const Discord = require("discord.js");

// Networks availables
const XDAI_NETWORK = "XDAI";
const MAINNET_NETWORK = "MAINNET";
const MINT_ACTION = "MINT";
const TRANSFER_ACTION = "TRANSFER";
const BURN_ACTION = "BURN";

const options = {
  // Enable auto reconnection
  reconnect: {
    auto: true,
    delay: 5000, // ms
    maxAttempts: 20,
    onTimeout: false,
  },
};

const bot = new Discord.Client();

bot.login(DISCORD_TOKEN);
bot.on("ready", () => {
  console.info(`Discord Bot logged in: ${bot.user.tag}!`);
});

const start = () => {
  console.log("+*+*+*+*+*+*+*+*+*+*+*+*+*+*+");
  console.log("Starting to listen POAP events...");
  console.log("+*+*+*+*+*+*+*+*+*+*+*+*+*+*+");

  const web3xDai = new Web3(
    new Web3.providers.WebsocketProvider(XDAI_WS_PROVIDER, options)
  );
  const web3Mainnet = new Web3(
    new Web3.providers.WebsocketProvider(MAINNET_WS_PROVIDER, options)
  );

  subscribeToTransfer(web3xDai, POAP_XDAI_CONTRACT, XDAI_NETWORK);
  subscribeToTransfer(web3Mainnet, POAP_XDAI_CONTRACT, MAINNET_NETWORK);
};

const subscribeToTransfer = (web3, address, network) => {
  let lastHash = ""
  console.log(`Subscribing to ${network} - ${address} `);
  const PoapContract = new web3.eth.Contract(PoapAbi, address);
  PoapContract.events
    .Transfer(null)
    .on("data", async (result) => {
      // console.log(result)
      const tokenId = result.returnValues.tokenId;
      const fromAddress = result.returnValues.from;
      const toAddress = result.returnValues.to;
      const txHash = result.transactionHash;

      console.log(`TokenId: ${tokenId}, to: ${toAddress}, tx: ${txHash}`);

      const tokenInfo = await getTokenById(tokenId);

      // mint
      // transfer
      // burn
      const action =
        fromAddress == ZEROX
          ? MINT_ACTION
          : toAddress == ZEROX
          ? BURN_ACTION
          : TRANSFER_ACTION;

      if (tokenInfo && tokenInfo.image_url && lastHash != txHash) {
        logPoap(
          tokenInfo.image_url,
          action,
          tokenId,
          tokenInfo.id,
          tokenInfo.name,
          toAddress,
          tokenInfo.poapPower,
          tokenInfo.ens,
          network
        );
        lastHash = txHash
      }
    })
    .on("connected", (subscriptionId) => {
      console.log(`Connected to ${network} - ${subscriptionId} `);
    })
    .on("changed", (log) => {
      console.log(`Changed to ${network} - ${log} `);
    })
    .on("error", (error) => {
      console.log(`Error to ${network} - ${error} `);
    });
};

const getTokenById = async (tokenId) => {
  const tokenInfoCompleted = await axios
    .get(`https://api.poap.xyz/token/${tokenId}`)
    .then(async (response) => {
      // {"event":{"id":1710,"fancy_id":"avastars-birthday-party-winner-poap-2021","name":"Avastars Birthday Party WINNER POAP","event_url":"https://avastars.io/","image_url":"https://storage.googleapis.com/poapmedia/avastars-birthday-party-winner-poap-2021-logo-1618590848145.png","country":"","city":"","description":"Poap for winners of giveaways","year":2021,"start_date":"20-Apr-2021","end_date":"20-Apr-2021"},"tokenId":"168570","owner":"0x4af37e995eb4fadc77a5ee355ae0a80edc5d1f04","layer":"Layer2"}
      const { id, name, image_url } = response.data.event;
      const address = response.data.owner;
      const tokenWithEns = await axios
        .get(`https://api.poap.xyz/actions/ens_lookup/${address}`)
        .then(async (ensResponse) => {
          //ens is null if it is not valid
          const { ens } = ensResponse.data;
          const tokenInfoWithPower = await axios
            .get(`https://api.poap.xyz/actions/scan/${address}`)
            .then(async (scanResponse) => {
              const poapPower = scanResponse.data.length;
              return {
                id,
                name,
                address,
                image_url,
                poapPower,
                ens,
              };
            })
            .catch((e) => console.log(e));
          return tokenInfoWithPower;
        })
        .catch((e) => console.log(e));
      return tokenWithEns;
    })
    .catch((e) => console.log(e));
  return tokenInfoCompleted;
};

const logPoap = async (
  imageUrl,
  action,
  tokenId,
  eventId,
  eventName,
  address,
  poapPower,
  ens,
  network
) => {
  const channel = bot.channels.cache.find(
    (ch) => ch.name === DISCORD_CHANNEL_NAME
  );

  const channelMainnetOnly = bot.channels.cache.find(
      (ch) => ch.name === DISCORD_CHANNEL_MAINNET_NAME
  );

  const embed = getEmbedPoap(imageUrl, action, tokenId, eventId,
                        eventName, address, poapPower, ens, network);

    if (channel){
        channel.send(embed);
    }

    if(channelMainnetOnly && network === MAINNET_NETWORK){
        channelMainnetOnly.send(embed);
    }
};

const getEmbedPoap = (imageUrl,
                        action,
                        tokenId,
                        eventId,
                        eventName,
                        address,
                        poapPower,
                        ens,
                        network) => {
    return new Discord.MessageEmbed() // Ver 12.2.0 of Discord.js
        .setTitle(`${action}: ${eventName} `)
        .setColor(network === MAINNET_NETWORK ? "#5762cf" : "#48A9A9")
        // removed, maybe we can show mainnet etherscan link
        // .setDescription(
        // 	`POAP Power: ${poapPower} ${emoji(poapPower)} | Token ID# ${tokenId} | Event ID#: ${eventId}`
        // )
        .addFields(
            {
                name: "POAP Power",
                value: `${emoji(poapPower)}  ${poapPower}`,
                inline: true,
            },
            { name: "Token ID", value: `#${tokenId}`, inline: true },
            { name: "Event ID", value: `#${eventId}`, inline: true }
        )
        .setURL(`https://poap.gallery/event/${eventId}/?utm_share=discordfeed`)
        .setTimestamp()
        .setAuthor(
            ens ? ens : address.toLowerCase(),
            ``,
            `https://app.poap.xyz/scan/${address}/?utm_share=discordfeed`
        )
        .setThumbnail(imageUrl);
}

const emoji = (poapPower) => {
  return poapPower <= 5
    ? "🆕 "
    : poapPower <= 10
    ? "🟢 "
    : poapPower <= 20
    ? "🟡 "
    : poapPower <= 50
    ? "🔴 "
    : "🔥 ";
};

start();
