const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cdyncc5.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'UnAuthorized access' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' })
    }
    req.decoded = decoded;
    next();
  });
}

async function run(){
    try{
        await client.connect();
        const serviceCollection = client.db('books_portal12').collection('services');
        const bookingCollection = client.db('books_portal12').collection('bookings');
        const userCollection = client.db('books_portal12').collection('users');
        const bookCollection = client.db('books_portal12').collection('books');
        const paymentCollection = client.db('books_portal12').collection('payments');

        const verifyAdmin = async (req, res, next) => {
          const requester = req.decoded.email;
          const requesterAccount = await userCollection.findOne({ email: requester });
          if (requesterAccount.role === 'admin') {
            next();
          }
          else {
            res.status(403).send({ message: 'forbidden' });
          }
        }

        app.post('/create-payment-intent', verifyJWT, async(req, res) =>{
          const service = req.body;
          const price = service.price;
          const amount = price*100;
          const paymentIntent = await stripe.paymentIntents.create({
            amount : amount,
            currency: 'usd',
            payment_method_types:['card']
          });
          res.send({clientSecret: paymentIntent.client_secret})
        });

        app.get('/service', async(req, res) =>{
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        })

        app.get('/service/:id', async(req, res) =>{
            const id = req.params.id;
            const query={_id: ObjectId(id)};
            const service = await serviceCollection.findOne(query);
            res.send(service);
        });

        app.post('/booking', async(req, res) =>{
          const booking = req.body;
          const result = await bookingCollection.insertOne(booking);
          res.send(result);
      });

      app.get('/booking',verifyJWT, async(req, res) =>{
        const email = req.query.email;
        const decodedEmail = req.decoded.email;
        if (email === decodedEmail) {
        const query = {email: email};
        const bookings = await bookingCollection.find(query).toArray();
        return res.send(bookings);
      }
      else {
        return res.status(403).send({ message: 'forbidden access' });
      }
        
      })

      app.patch('/booking/:id', verifyJWT, async(req, res) =>{
        const id  = req.params.id;
        const payment = req.body;
        const filter = {_id: ObjectId(id)};
        const updatedDoc = {
          $set: {
            paid: true,
            transactionId: payment.transactionId
          }
        }
  
        const result = await paymentCollection.insertOne(payment);
        const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
        res.send(updatedBooking);
      })

      app.get('/booking/:id', verifyJWT, async(req, res) =>{
        const id = req.params.id;
        const query = {_id: ObjectId(id)};
        const booking = await bookingCollection.findOne(query);
        res.send(booking);
      })


      app.get('/user', verifyJWT, async (req, res) => {
        const users = await userCollection.find().toArray();
        res.send(users);
      });

      app.get('/admin/:email', async(req, res) =>{
        const email = req.params.email;
        const user = await userCollection.findOne({email: email});
        const isAdmin = user.role === 'admin';
        res.send({admin: isAdmin})
      })

      app.put('/user/admin/:email', verifyJWT,verifyAdmin, async (req, res) => {
        const email = req.params.email;
       
          const filter = { email: email };
          const updateDoc = {
            $set: { role: 'admin' },
          };
          const result = await userCollection.updateOne(filter, updateDoc);
          res.send(result);
        
  
      })

      app.put('/user/:email', async (req, res) => {
        const email = req.params.email;
        const user = req.body;
        const filter = { email: email };
        const options = { upsert: true };
        const updateDoc = {
          $set: user,
        };
        const result = await userCollection.updateOne(filter, updateDoc, options);
        const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
        res.send({ result, token });
      })

      app.get('/book', verifyJWT, verifyAdmin, async(req, res) =>{
        const books = await bookCollection.find().toArray();
        res.send(books);
      })

      app.post('/book', verifyJWT, verifyAdmin, async (req, res) => {
        const book = req.body;
        const result = await bookCollection.insertOne(book);
        res.send(result);
      });

      app.delete('/book/:email', verifyJWT, verifyAdmin, async (req, res) => {
        const email = req.params.email;
      const filter = {email: email};
      const result = await bookCollection.deleteOne(filter);
      res.send(result);
      });


    }
    finally{

    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello From Book House!')
})

app.listen(port, () => {
  console.log(`Book App listening on port ${port}`)
})






