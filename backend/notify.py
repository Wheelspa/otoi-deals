import logging
import os

logger = logging.getLogger("otoi.sms")


def sms_configured() -> bool:
    return all(os.environ.get(k) for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"))


def normalize_phone(phone: str) -> str:
    digits = "".join(c for c in (phone or "") if c.isdigit() or c == "+")
    if digits.startswith("+"):
        return digits
    if len(digits) == 10:
        return "+91" + digits
    return "+" + digits


def send_sms(to: str, body: str) -> str:
    """Returns 'sent', 'mocked' or 'failed'. Mocked when Twilio keys are absent."""
    if not sms_configured():
        logger.info("[SMS MOCKED] to=%s body=%s", to, body)
        return "mocked"
    try:
        from twilio.rest import Client
        client = Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
        client.messages.create(to=normalize_phone(to), from_=os.environ["TWILIO_FROM_NUMBER"], body=body)
        return "sent"
    except Exception as exc:
        logger.error("SMS send failed: %s", exc)
        return "failed"


def whatsapp_configured() -> bool:
    return all(os.environ.get(k) for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"))


def send_whatsapp(to: str, body: str, media_url: str = "") -> str:
    """Returns 'sent', 'mocked' or 'failed'. Mocked when Twilio WhatsApp keys are absent."""
    if not whatsapp_configured():
        logger.info("[WHATSAPP MOCKED] to=%s body=%s media=%s", to, body, media_url)
        return "mocked"
    try:
        from twilio.rest import Client
        client = Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
        sender = os.environ["TWILIO_WHATSAPP_FROM"]
        kwargs = {"to": "whatsapp:" + normalize_phone(to),
                  "from_": sender if sender.startswith("whatsapp:") else "whatsapp:" + sender, "body": body}
        if media_url:
            kwargs["media_url"] = [media_url]
        client.messages.create(**kwargs)
        return "sent"
    except Exception as exc:
        logger.error("WhatsApp send failed: %s", exc)
        return "failed"
