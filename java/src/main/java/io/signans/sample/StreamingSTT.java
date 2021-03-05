package io.signans.sample;

import java.io.StringReader;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import jakarta.json.Json;
import jakarta.json.JsonObject;

public class StreamingSTT {
  public static void main(String[] args) {
    final CountDownLatch latch = new CountDownLatch(1);

    WebSocket.Listener listener = new WebSocket.Listener() {
      private StringBuilder textMessage = new StringBuilder();

      private void setLanguage(WebSocket webSocket) {
        System.out.println("Setting language.");
        String data = Json.createObjectBuilder()
            .add("command", StreamingSTTAPI.COMMAND_SET_LANGUAGE)
            .add("value", "ja")
            .build()
            .toString();
        webSocket.sendText(data, true);
      }

      private void setSamplingRate(WebSocket webSocket) {
        System.out.println("Setting sampling rate.");
        String data = Json.createObjectBuilder()
            .add("command", StreamingSTTAPI.COMMAND_SET_SAMPLING_RATE)
            .add("value", 16000)
            .build()
            .toString();
        webSocket.sendText(data, true);
      }

      private void sendAudio(WebSocket webSocket) {
        // Use a new thread to send data asynchronously.
        new Thread(() -> {
          Path file = Paths.get("ja.wav");
          try (FileChannel fc = FileChannel.open(file)) {
            // Send audio data to server, 4k per 0.1 second.
            ByteBuffer buf = ByteBuffer.allocate(4096);
            while (true) {
              buf.clear();
              if (fc.read(buf) == -1) {
                break;
              }
              buf.flip();
              while (buf.hasRemaining()) {
                webSocket.sendBinary(buf, true);
                TimeUnit.MILLISECONDS.sleep(100);
              }
            }
          } catch (Exception e) {
            e.printStackTrace();
          } finally {
            String data = Json.createObjectBuilder()
                .add("command", StreamingSTTAPI.COMMAND_END_STREAM)
                .build()
                .toString();
            webSocket.sendText(data, true);
          }
        }).start();
      }

      private void printRecognitionResult(String message) {
        JsonObject jsonObject = Json.createReader(new StringReader(message))
            .readObject();
        String status = jsonObject.getString("status");
        String text = jsonObject.getString("value");
        System.out.println(String.format("[%s] %s", status, text));
      }

      @Override
      public void onOpen(WebSocket webSocket) {
        System.out.println("Connected to streaming STT API.");
        webSocket.request(1);
        // Set language after connection established.
        this.setLanguage(webSocket);
      }

      @Override
      public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
        webSocket.request(1);
        this.textMessage.append(data);
        if (last) {
          String completeMessage = this.textMessage.toString();
          this.textMessage = new StringBuilder();
          JsonObject jsonObject = Json.createReader(new StringReader(completeMessage))
              .readObject();
          String messageType = jsonObject.getString("type");
          switch (messageType) {
          case StreamingSTTAPI.RESPONSE_LANGUAGE_READY:
            System.out.println("Language has been set.");
            this.setSamplingRate(webSocket);
            break;
          case StreamingSTTAPI.RESPONSE_SAMPLING_RATE_READY:
            System.out.println("Sampling rate has been set.");
            this.sendAudio(webSocket);
            break;
          case StreamingSTTAPI.RESPONSE_RECOGNITION_RESULT:
            System.out.println("Received recognition result:");
            this.printRecognitionResult(completeMessage);
            break;
          case StreamingSTTAPI.RESPONSE_RECOGNITION_ERROR:
            System.err.println("Recognition error");
            System.err.println(completeMessage);
            break;
          default:
            System.err.println("Unexpected message type: " + messageType);
          }
        }
        return null;
      }

      @Override
      public void onError(WebSocket webSocket, Throwable error) {
        System.err.println("WebSocket error occurred: " + error.getMessage());
      }

      @Override
      public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
        System.out.println(String.format("WebSocket closed. Status code [%d]. Reason [%s].", statusCode, reason));
        latch.countDown();
        return null;
      }
    };

    try {
      JWT jwt = new JWT(API.ACCESS_KEY, API.SECRET_KEY, API.JWT_DURATION);
      String token = jwt.getToken();
      String path = "/api/v1/translate/stt-streaming";
      String tokenParam = "token=" + URLEncoder.encode("Bearer " + token, StandardCharsets.UTF_8);
      String url = API.WEBSOCKET_BASE_URL + path + "?" + tokenParam;
      HttpClient.newHttpClient()
          .newWebSocketBuilder()
          .buildAsync(URI.create(url), listener)
          .get();
      latch.await();
    } catch (Exception e) {
      e.printStackTrace();
    }
  }
}
