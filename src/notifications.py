"""Notification service using Pushover."""

from typing import Dict, Any
from pushover import Client

class NotificationService:
    def __init__(self, user_key: str, app_token: str):
        self.client = Client(user_key, api_token=app_token)

    def send_notification(self, title: str, message: str, 
                        priority: int = 0) -> bool:
        """Send a notification via Pushover."""
        try:
            self.client.send_message(message, title=title, priority=priority)
            return True
        except Exception as e:
            print(f"Failed to send notification: {str(e)}")
            return False
