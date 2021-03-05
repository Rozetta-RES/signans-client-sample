package io.signans.sample;

final class StreamingSTTAPI {
  public static final String COMMAND_SET_LANGUAGE = "SET_LANGUAGE";

  public static final String COMMAND_SET_SAMPLING_RATE = "SET_SAMPLING_RATE";

  public static final String COMMAND_END_STREAM = "END_STREAM";

  public static final String COMMAND_END_SESSION = "END_SESSION";

  public static final String RESPONSE_LANGUAGE_READY = "LANGUAGE_READY";

  public static final String RESPONSE_SAMPLING_RATE_READY = "SAMPLING_RATE_READY";

  public static final String RESPONSE_RECOGNITION_RESULT = "RECOGNITION_RESULT";

  public static final String RESPONSE_RECOGNITION_ERROR = "RECOGNITION_ERROR";

  private StreamingSTTAPI() {
  }
}
