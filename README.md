# Audio Streaming Dashboard

This project is an audio streaming dashboard that allows you to manage and configure multiple audio streams over multicast RTP. It includes a web interface for controlling audio channels, adjusting volume and panning, and saving/loading configurations. It allows for using role management, team assignment, and team management.

## Prerequisites

- Node.js (version 14 or higher)
- Python (version 3.10 or higher)
- Docker (optional, for running as a container)
- AWS Environment with Multicast Enabled and two Ubuntu EC2 machines

## Running the Project Locally

1. Clone the repository:

   ```sh
   git clone <repository-url>
   cd <repository-directory>/app
   ```

2. Install dependencies

   ```sh
   npm install
   npm install dotenv bcrypt
   ```

3. Modify external api keys
   - Change MongoURL
   - Change Hanko API URL

4. Start the server (machine 1)

   ```sh
   sudo nohup node server.js > output.log 2>&1 &
   ```

5. Start the audio stream (machine 2)

   ```sh
   nohup python3 stream_audio.py > python.out 2>&1 &
   ```

5. Navigate to `https://localhost:443/`

## Running the Project with Docker

1. Clone the repository:

   ```sh
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Build and start the container
   ```sh
   docker-compose up
   ```

3. Navigate to `https://localhost:443/`
   
## Setting up AWS Multicast

1. Set up VPC
   Use CIDR 10.99.0.0/16

3. Set up subnets as follows\
   Public 1: 10.99.0.0/18 - east 1a\
   Public 2: 10.99.64.0/18 - east 1b\
   Private 1: 10.99.128.0/18 - east 1a\
   Private 2: 10.99.192.0/18 - east 1b

4. Set up Internet Gateway\
   Add IGW to subnet 'Public 1' routing table\
   Add IGW to subnet 'Public 2' routing table

4. Create Transit Gateway\
   Check enable multicast support\
   Leave all else default and confirm

6. Create Transit Gateway Attachment\
   Add Transit Gateway\
   Add VPC\
   Subnets autopopulate with Public 1 and 2\
   Create attachment

6. Create Transit Gateway Multicast Domain\
   Attach Transit Gateway\
   Check enable IGMP2 support

8. Set up VMS\
   Host must have inbound traffic allowed\
   Generator only needs outbound traffic\
   Both need elastic ip association

8. Create Transit Gateway Multicast Domain Association\
   Include public subnets

10. Create multicast groups within multicast domain\
    Select groups\
    Add member (ec2 machines)\
    Input multicast domain ie 239.0.0.1\
    Select all available network interfaces\
    Click add group members

10. Disable source destination checking\
    Go to instances page\
    Select each instance\
    Click the actions drop down -> 'networking' -> 'change source/destination check' and check stop

12. Test traffic\
    On the sending machine run
    ```sh
    iperf -s -u -B 239.0.0.1
    ```
    On host machine run
    ```sh
    iperf -u -c 239.0.0.1 -t 30 -b 1M
    ```
