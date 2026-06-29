import asyncio
import bluetooth
from machine import Pin, PWM

import aioble

DEVICE_NAME = "AI_LED"
COMMON_ANODE = False

RED_PIN = 16
GREEN_PIN = 17
BLUE_PIN = 18

NUS_SERVICE_UUID = bluetooth.UUID("6e400001-b5a3-f393-e0a9-e50e24dcca9e")
NUS_RX_UUID = bluetooth.UUID("6e400002-b5a3-f393-e0a9-e50e24dcca9e")
NUS_TX_UUID = bluetooth.UUID("6e400003-b5a3-f393-e0a9-e50e24dcca9e")

nus_service = aioble.Service(NUS_SERVICE_UUID)
rx_characteristic = aioble.Characteristic(
    nus_service,
    NUS_RX_UUID,
    write=True,
    write_no_response=True,
)
tx_characteristic = aioble.Characteristic(nus_service, NUS_TX_UUID, notify=True)
aioble.register_services(nus_service)

red = PWM(Pin(RED_PIN))
green = PWM(Pin(GREEN_PIN))
blue = PWM(Pin(BLUE_PIN))

for channel in (red, green, blue):
    channel.freq(1000)

breathing = False


def duty(value):
    value = max(0, min(65535, int(value)))
    return 65535 - value if COMMON_ANODE else value


def rgb(r, g, b):
    red.duty_u16(duty(r))
    green.duty_u16(duty(g))
    blue.duty_u16(duty(b))


def set_led(command):
    global breathing
    breathing = command == "B"

    if command == "R":
        rgb(65535, 0, 0)
    elif command == "G":
        rgb(0, 65535, 0)
    elif command == "Y":
        rgb(65535, 36000, 0)
    elif command == "B":
        rgb(0, 0, 0)
    else:
        rgb(0, 0, 0)


async def breathe_loop():
    level = 0
    direction = 1

    while True:
        if breathing:
            rgb(0, 0, level)
            level += direction * 2200

            if level >= 42000:
                level = 42000
                direction = -1

            if level <= 1600:
                level = 1600
                direction = 1

        await asyncio.sleep_ms(45)


async def peripheral_loop():
    set_led("G")

    while True:
        async with await aioble.advertise(
            250000,
            name=DEVICE_NAME,
            services=[NUS_SERVICE_UUID],
        ) as connection:
            while connection.is_connected():
                await rx_characteristic.written()
                data = rx_characteristic.read()

                if data:
                    set_led(data.decode("utf-8")[:1])


async def main():
    await asyncio.gather(peripheral_loop(), breathe_loop())


asyncio.run(main())
