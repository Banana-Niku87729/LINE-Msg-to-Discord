// LINEからDiscordへのメッセージ転送プログラム
require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
const FormData = require('form-data');

// 環境変数の設定
const PORT = process.env.PORT || 3000;
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1360974781993980105/3yq-jOqNSdJFPk22zqPBQCDiU-sY_TRKLE2gXG8e7WMSvpEFvebZcOGAAgmfsaZijLnd';
const TEMP_IMAGE_DIR = './temp_images';

// LINE設定
const lineConfig = {
  channelAccessToken: 'vSJE+Tf7g8dxaHT5tdk6VrF5Us8ATTigmgWboaCT6tNegT8gyclb5yZV7lIWDX2t8CFpRixFSCbS0Dtb2SJvnt6XfcTPTr6AaJEcJhvuVs2B2fB+Uzbzh1b1IXU29zXrwgXPqzkal+MSjU7Bvamd3AdB04t89/1O/w1cDnyilFU=',
  channelSecret: 'bdf28d831f7b84b77282ff8669982394'
};

// LINEクライアント初期化
const lineClient = new line.Client(lineConfig);

// 一時的な画像保存ディレクトリを作成
if (!fs.existsSync(TEMP_IMAGE_DIR)) {
  fs.mkdirSync(TEMP_IMAGE_DIR);
}

console.log('環境変数チェック:');
console.log('LINE_CHANNEL_ACCESS_TOKEN 存在:', !!process.env.LINE_CHANNEL_ACCESS_TOKEN);
console.log('LINE_CHANNEL_SECRET 存在:', !!process.env.LINE_CHANNEL_SECRET);
console.log('DISCORD_WEBHOOK_URL 存在:', !!process.env.DISCORD_WEBHOOK_URL);

// LINE Webhookの設定
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error('エラーが発生しました:', err);
    res.status(500).end();
  }
});

// イベント処理関数
async function handleEvent(event) {
  if (event.type !== 'message') return;

  try {
    // グループ名またはユーザー名を取得
    let sourceType = event.source.type;
    let senderId = '';
    let groupId = '';
    let groupName = '';
    
    if (sourceType === 'group') {
      groupId = event.source.groupId;
      senderId = event.source.userId;
      
      // グループ情報を取得
      try {
        const groupSummary = await lineClient.getGroupSummary(groupId);
        groupName = groupSummary.groupName;
      } catch (error) {
        console.error('グループ情報の取得に失敗しました:', error);
        groupName = 'Unknown Group';
      }
    } else if (sourceType === 'room') {
      groupId = event.source.roomId;
      senderId = event.source.userId;
      groupName = 'Chat Room';
    } else {
      senderId = event.source.userId;
      groupName = 'Direct Message';
    }

    // ユーザープロフィール取得
    let senderName = 'Unknown User';
    let senderIconUrl = null;
    
    try {
      let profile;
      if (sourceType === 'group') {
        profile = await lineClient.getGroupMemberProfile(groupId, senderId);
      } else if (sourceType === 'room') {
        profile = await lineClient.getRoomMemberProfile(groupId, senderId);
      } else {
        profile = await lineClient.getProfile(senderId);
      }
      
      senderName = profile.displayName;
      senderIconUrl = profile.pictureUrl;
    } catch (error) {
      console.error('ユーザープロフィールの取得に失敗しました:', error);
    }

    // Discordに送信する名前のフォーマット
    const formattedName = `${senderName} ${groupName}`;

    // メッセージの種類に応じた処理
    switch (event.message.type) {
      case 'text':
        await sendToDiscord(formattedName, event.message.text, senderIconUrl);
        break;
        
      case 'image':
        try {
          // 画像の処理
          const stream = await lineClient.getMessageContent(event.message.id);
          const imagePath = path.join(TEMP_IMAGE_DIR, `${event.message.id}.jpg`);
          
          // 画像をローカルに保存
          const writable = fs.createWriteStream(imagePath);
          stream.pipe(writable);
          
          await new Promise((resolve, reject) => {
            writable.on('finish', resolve);
            writable.on('error', reject);
          });
          
          // Discordに画像を送信
          await sendImageToDiscord(formattedName, imagePath, senderIconUrl);
          
          // 一時ファイルを削除
          fs.unlinkSync(imagePath);
        } catch (error) {
          console.error('画像の転送に失敗しました:', error);
          await sendToDiscord(formattedName, '[画像の転送に失敗しました]', senderIconUrl);
        }
        break;
        
      case 'sticker':
        await sendToDiscord(formattedName, '[スタンプのため転送できておりません]', senderIconUrl);
        break;
        
      default:
        await sendToDiscord(formattedName, `[未対応のメッセージタイプ: ${event.message.type}]`, senderIconUrl);
        break;
    }
  } catch (error) {
    console.error('メッセージ処理中にエラーが発生しました:', error);
  }
}

// テキストメッセージをDiscordに送信
async function sendToDiscord(username, content, avatarUrl) {
  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      username: username,
      avatar_url: avatarUrl,
      content: content
    });
  } catch (error) {
    console.error('Discordへの送信に失敗しました:', error);
  }
}

// 画像をDiscordに送信
async function sendImageToDiscord(username, imagePath, avatarUrl) {
  try {
    const form = new FormData();
    
    form.append('payload_json', JSON.stringify({
      username: username,
      avatar_url: avatarUrl
    }));
    
    form.append('file', fs.createReadStream(imagePath));
    
    await axios.post(DISCORD_WEBHOOK_URL, form, {
      headers: form.getHeaders()
    });
  } catch (error) {
    console.error('Discordへの画像送信に失敗しました:', error);
  }
}

// サーバー起動
app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
});
