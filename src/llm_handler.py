import openai
import os
import logging
from typing import Optional, Dict

# Configure basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_llm_forecast(
    data_summary: str,
    rubric: str,
    llm_config: Dict[str, any],
    api_key: str
) -> Optional[str]:
    """
    Generates a narrative forecast using an LLM provider based on summarized data and a rubric.

    Args:
        data_summary: A string containing the summarized weather and tide data.
        rubric: The LLM rubric string (system message).
        llm_config: A dictionary containing LLM settings (provider, model, temperature, max_tokens).
        api_key: The API key for the LLM provider.

    Returns:
        Optional[str]: The textual forecast from the LLM, or None if an error occurs.
    """
    provider = llm_config.get("provider")
    model = llm_config.get("model")
    temperature = llm_config.get("temperature", 0.7) # Default temperature if not specified
    max_tokens = llm_config.get("max_tokens", 300)   # Default max_tokens if not specified

    if not provider or not model:
        logging.error("LLM provider or model not specified in llm_config.")
        return None

    if not api_key:
        logging.error(f"API key for {provider} not provided.")
        return None

    logging.info(f"Requesting LLM forecast from provider: {provider}, model: {model}")

    if provider.lower() == "openai":
        try:
            # Set the API key for the openai library instance
            # Note: openai library might also pick up OPENAI_API_KEY env var if set,
            # but explicitly setting it here ensures the passed key is used.
            client = openai.OpenAI(api_key=api_key)

            logging.debug(f"System Prompt (Rubric):\n{rubric}")
            logging.debug(f"User Prompt (Data Summary):\n{data_summary}")
            
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": rubric},
                    {"role": "user", "content": data_summary}
                ],
                temperature=float(temperature),
                max_tokens=int(max_tokens)
            )

            if response.choices and response.choices[0].message:
                forecast_text = response.choices[0].message.content.strip()
                logging.info("Successfully received forecast from OpenAI.")
                logging.debug(f"LLM Raw Response Text:\n{forecast_text}")
                return forecast_text
            else:
                logging.error("OpenAI API response did not contain expected content.")
                logging.debug(f"Full OpenAI API response: {response}")
                return None

        except openai.APIConnectionError as e:
            logging.error(f"OpenAI API request failed to connect: {e}")
            return None
        except openai.RateLimitError as e:
            logging.error(f"OpenAI API request exceeded rate limit: {e}")
            return None
        except openai.AuthenticationError as e:
            logging.error(f"OpenAI API authentication failed (invalid API key?): {e}")
            return None
        except openai.APIStatusError as e:
            logging.error(f"OpenAI API returned an error status {e.status_code}: {e.response}")
            return None
        except Exception as e:
            logging.error(f"An unexpected error occurred while calling OpenAI API: {e}")
            return None
    else:
        logging.error(f"Unsupported LLM provider: {provider}")
        return None

if __name__ == '__main__':
    # Example Usage (requires OPENAI_API_KEY to be set in environment or passed)
    # Create a dummy config.yaml and rubric.md for this example to run
    
    # Dummy llm_config (normally from config.yaml)
    dummy_llm_config = {
        "provider": "openai",
        "model": "gpt-3.5-turbo", # Use a cheaper model for testing
        "temperature": 0.5,
        "max_tokens": 150
    }

    # Dummy data_summary
    dummy_data_summary = (
        "Suitable Kayaking Windows for Tomorrow (2023-10-27):\n"
        "1. Morning Slot: 08:00 AM to 11:30 AM (3.5 hours)\n"
        "   - Tide: High tide around 9:30 AM (5.5 ft), flowing out later.\n"
        "   - Weather: Clear, Temp 60-65°F, Wind 5-7 mph NW, Precip 0%.\n"
        "2. Afternoon Slot: 03:00 PM to 05:00 PM (2.0 hours)\n"
        "   - Tide: Incoming tide, reaching 4.0 ft by 5 PM.\n"
        "   - Weather: Partly cloudy, Temp 62-68°F, Wind 8-10 mph W, Precip 10%.\n"
        "Overall recommendation: Morning slot looks best due to calmer winds and clearer skies."
    )

    # Dummy rubric (normally from rubric.md)
    dummy_rubric = (
        "You are a kayaking conditions forecaster. Based on the provided data summary, "
        "generate a concise and easy-to-understand narrative forecast for a kayaker. "
        "Highlight the best times for kayaking, considering tide and weather. "
        "Mention any potential concerns. Be encouraging and use a friendly tone."
    )
    
    # Attempt to get API key from environment variable for the example
    # In the actual application, this will be passed from main.py
    example_api_key = os.getenv("OPENAI_API_KEY")

    if not example_api_key:
        print("OPENAI_API_KEY environment variable not set. Skipping example execution.")
    else:
        print(f"Attempting to generate LLM forecast with model: {dummy_llm_config['model']}...\n")
        forecast = get_llm_forecast(
            dummy_data_summary,
            dummy_rubric,
            dummy_llm_config,
            example_api_key
        )

        if forecast:
            print("--- Generated LLM Forecast ---")
            print(forecast)
            print("----------------------------")
        else:
            print("--- Failed to generate LLM forecast ---")
            
    # Example with a non-existent API key for error testing
    print("\nAttempting with a fake API key (expecting authentication error)...")
    fake_key = "sk-thisisafakekeythatwillnotwork12345"
    error_forecast = get_llm_forecast(
        dummy_data_summary,
        dummy_rubric,
        dummy_llm_config,
        fake_key
    )
    if not error_forecast:
        print("Correctly failed to generate forecast with fake API key.")
    else:
        print("Test with fake API key did not fail as expected.")

    # Example with an unsupported provider
    print("\nAttempting with an unsupported provider (expecting error)...")
    unsupported_config = dummy_llm_config.copy()
    unsupported_config["provider"] = "megacorp_ai"
    error_forecast_provider = get_llm_forecast(
        dummy_data_summary,
        dummy_rubric,
        unsupported_config,
        example_api_key if example_api_key else "dummy_key_for_structure"
    )
    if not error_forecast_provider:
        print("Correctly failed due to unsupported provider.")
    else:
        print("Test with unsupported provider did not fail as expected.")
