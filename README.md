cp ./kukoin.service /lib/systemd/system/kukoin.service
cp ./kukoin-balace.service /lib/systemd/system/kukoin-balace.service


remove logs from service

journalctl --rotate
journalctl --vacuum-time=1s


show logs
journalctl -u kukoin.service
journalctl -u kukoin-balace.service

start new service

vim /lib/systemd/system/kukoin.service
vim /lib/systemd/system/kukoin-balace.service

systemctl daemon-reload
systemctl start kukoin
systemctl start kukoin-balace

systemctl stop kukoin
systemctl stop kukoin-balace


systemctl stop kukoin && systemctl stop kukoin-balace


systemctl status kukoin
systemctl status kukoin-balace


journalctl --rotate && journalctl --vacuum-time=1s && systemctl daemon-reload && systemctl start kukoin-balace && systemctl start kukoin
