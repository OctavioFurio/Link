# Link
Coursework for distributed systems and web development lectures, implementing a full-stack social network prototype.

## Deployment & Architecture overview
```mermaid
graph TD
    FE[<b>Front-end</b><br><i>HTML/CSS/JS<br>Github Pages] <-->|REST API| API

    API[<b>Aplicação / Back-end</b><br><i>Python + FastAPI]
    
    Base[(<b>Banco de Dados</b><br><i>Firebase)]
    API <-->|Dados| Base

    API <-->|gRPC| ENG[<b>Engine de Recomendação]
```
