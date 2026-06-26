# =============================================================================
# BikerLink — Immagine GraphHopper CUSTOM compilata da sorgente su Java 25.
#
# - Stage build: JDK 25 (Temurin) + Maven, clona graphhopper/graphhopper@master
#   HEAD e compila il fat jar del modulo web (graphhopper-web-*.jar).
# - Stage runtime: JRE 25 (Temurin) + curl/wget. Replica il contratto d'avvio
#   dell'immagine israelhikingmap: WORKDIR /graphhopper, porta 8989, script
#   graphhopper.sh (legge le env FILE/GRAPH e forza graph.location via sysprop),
#   entrypoint "./graphhopper.sh -c config-example.yml".
# =============================================================================

FROM eclipse-temurin:25-jdk AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends git maven ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 https://github.com/graphhopper/graphhopper.git .
# -pl web -am: builda il modulo web e le sue dipendenze. Il maven-shade-plugin
# produce il fat jar graphhopper-web-<ver>.jar in web/target/.
RUN mvn -B -DskipTests -pl web -am clean package

FROM eclipse-temurin:25-jre
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl wget ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /graphhopper
COPY --from=build /src/web/target/graphhopper-web-*.jar ./
COPY --from=build /src/config-example.yml ./
COPY graphhopper.sh ./graphhopper.sh
RUN chmod +x graphhopper.sh
EXPOSE 8989
ENTRYPOINT ["./graphhopper.sh", "-c", "config-example.yml"]
