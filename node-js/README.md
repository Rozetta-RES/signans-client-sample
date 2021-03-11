# signans-nodejs-client-sample

シグナンスAPIのクライアントNode.jsサンプルコード。

## 要件

* Node.js 

## プロジェクトの構成

ソースコードは`src`ディレクトリに置いています。

* `auth.js`：JWTを取得する。
* `text-translation.js`：テキスト翻訳。
* `streaming-stt.js`：ストリーミング音声認識。
* `language-list`：言語リストを取得する。

## 利用の流れ

`node-js`ディレクトリ直下で、以下のコマンドを実行してください。

```
npm install
```

上記コマンドの実行後に、以下のスクリプトを利用できます。

* テキスト翻訳

```
npm run text-translate
```

* ストリーミング音声認識

```
npm run streaming-stt
```

* 言語リストの取得

```
npm run language-list
```
