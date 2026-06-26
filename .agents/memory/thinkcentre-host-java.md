---
name: ThinkCentre host Java
description: Stato e gestione del Java di sistema (host, fuori Docker) sul ThinkCentre
---

# Java di sistema sull'host ThinkCentre

Il Java dell'host (fuori da Docker) NON è un servizio permanente: nessun processo
Java attivo, serve solo per comandi `java -jar` di tooling (build grafi GraphHopper,
planetiler). GraphHopper di produzione gira in Docker (×7 aree), non sull'host.

## Default attuale
- Host = Ubuntu 26.04 LTS ("resolute"). **OpenJDK 25 LTS è nei repo ufficiali Ubuntu**
  (`openjdk-25-jdk`, candidate 25.0.3) → NON serve Temurin/tarball.
- Default di sistema = Java 25 (update-alternatives auto, priorità più alta = best).
  `/usr/bin/java` → `java-25-openjdk-amd64`. OpenJDK 21 purgato (2026-06-26); 17 rimosso in precedenza.
- Solo alternativa registrata: `/usr/lib/jvm/java-25-openjdk-amd64/bin/java` (priorità 2511).

## Gotcha update-alternatives
Le openjdk Ubuntu auto-registrano l'alternativa con priorità crescente per major
(es. 25 → 2511 > 21 → 2111). In auto mode il nuovo JDK diventa default da solo;
verifica sempre con `update-alternatives --query java` (Best == Value).

## systemd
`graphhopper.service` esiste ma è **disabled+inactive** (legacy; il GH vero è in Docker)
e usa `ExecStart=/usr/bin/java` (symlink, non path hardcoded `java-NN-...`) → segue
automaticamente l'alternativa di default. Nessun edit del file al cambio major, solo
`daemon-reload`. Se in futuro una unit hardcoda un path `.../java-21-openjdk.../bin/java`,
quella sì va aggiornata a mano.

## Smoke test JVM rapido (host)
`cd /tmp && printf 'public class S{public static void main(String[] a){System.out.println(System.getProperty("java.version"));}}' > S.java && javac S.java && echo 'Main-Class: S' > mf && jar cfm s.jar mf S.class && java -jar s.jar`
