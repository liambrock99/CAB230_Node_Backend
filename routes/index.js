var express = require("express");
var router = express.Router();
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const urlencodedParser = bodyParser.urlencoded({ extended: false });
const jwt = require("jsonwebtoken");

const jwtSecretKey = "randomsecretkey";

function verifyJWT(req, res, next) {
  const authHeader = req.headers["authorization"];
  console.log(authHeader);

  if (typeof authHeader !== "undefined") {
    const token = authHeader.split(" ")[1];
    req.token = token;
    next();
  } else {
    res.status(401).json({
      message: "oh no! it looks like your authorization token is invalid..."
    });
  }
}

/* GET home page. */
router.get("/", function(req, res, next) {
  res.render("index", { title: "Queensland Crime Statistics API" });
});

/* POST register */
router.post("/register", urlencodedParser, (req, res, next) => {
  const email = req.body.email;
  const pwd = req.body.password;

  if (email.length === 0 || pwd.length === 0) {
    return res.status(400).json({
      message: "error creating new user - you need to supply both an email and"
    });
  }

  req
    .db("users")
    .where({ email: email })
    .then(rows => {
      if (rows.length > 0) {
        res
          .status(400)
          .json({ message: "oops! it looks like that user already exists :(" });
      } else {
        bcrypt.genSalt(10, (err, salt) => {
          bcrypt.hash(pwd, salt, (err, hash) => {
            req
              .db("users")
              .insert({ email: email, password: hash })
              .then(() => {
                res.status(201).json({
                  message:
                    "yay! you've successfully registered your user account"
                });
              });
          });
        });
      }
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ error: true, message: "Something went wrong." });
    });
});

/* POST login */
router.post("/login", urlencodedParser, (req, res, next) => {
  const email = req.body.email;
  const pwd = req.body.password;

  if (email.length === 0 || pwd.length === 0) {
    return res.status(401).json({
      message: "invalid login - you need to supply both an email and password"
    });
  }

  req
    .db("users")
    .where({ email: email })
    .select("password")
    .then(row => {
      if (row.length === 0) {
        return res.status(401).json({
          message:
            "oh no! it looks like there was a database error while creating your user, give it another try..."
        });
      }
      bcrypt.compare(pwd, row[0].password, (err, resp) => {
        if (resp) {
          const payload = {
            iss: "localhost:443",
            sub: "API Authorization",
            exp: 86400,
            email: email
          };
          jwt.sign({ payload: payload }, jwtSecretKey, (err, token) => {
            res.status(200).json({
              access_token: token,
              token_type: "Bearer",
              expires_in: 86400
            });
          });
        } else {
          res.status(401).json({ message: "invalid login - bad password" });
        }
      });
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ message: "Error in mySQL query" });
    });
});

router.get("/search", verifyJWT, (req, res, next) => {
  jwt.verify(req.token, jwtSecretKey, (err, data) => {
    if (err) {
      res.status(401).json({
        message: "oh no! it looks like your authorization token is invalid..."
      });
    } else {
      const offence = req.query.offence;
      if (typeof offence === undefined || offence.length === 0) {
        return res.status(400).json({
          message:
            "oops! it looks like you're missing the offence query parameter"
        });
      }

      const area = req.query.area;
      const age = req.query.age;
      const gender = req.query.gender;
      const year = req.query.year;
      const month = req.query.month;
      const offence_col = req.query.offence.replace(/[^\w]/g, "").toLowerCase();

      // Modify query if param exists and is valid
      const withParam = (queryBuilder, param, col_name) => {
        if (typeof param !== undefined && param.length !== 0) {
          return queryBuilder.whereIn(col_name, param.split(","));
        }
      };

      req
        .db("offences")
        .select("area")
        .sum({ sum: offence_col })
        .groupBy("area")
        .modify(withParam, area, "area")
        .modify(withParam, age, "age")
        .modify(withParam, gender, "gender")
        .modify(withParam, year, "year")
        .modify(withParam, month, "month")
        .then(rows => {
          const results = rows.map(e => ({ LGA: e.area, total: e.sum }));
          res.status(200).json({ query: "", result: results });
        })
        .catch(err => {
          res.status(500).json({ message: "Error in mySQL query" });
        });
    }
  });
});

/* Helper Routes */

/* GET offences */
router.get("/offences", (req, res, next) => {
  req.db
    .from("offence_columns")
    .select("pretty")
    .then(rows => {
      res.json({ offences: rows.map(e => e.pretty) });
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ message: "Error in mySQL query" });
    });
});

/* GET areas */
router.get("/areas", (req, res, next) => {
  req.db
    .from("areas")
    .select("area")
    .then(rows => {
      res.json({ areas: rows.map(e => e.area) });
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ message: "Error in mySQL query" });
    });
});

/* GET ages */
router.get("/ages", (req, res, next) => {
  req.db
    .from("offences")
    .distinct("age")
    .then(rows => {
      res.json({ ages: rows.map(e => e.age) });
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ message: "Error in mySQL query" });
    });
});

/* GET genders */
router.get("/genders", (req, res, next) => {
  req.db
    .from("offences")
    .distinct("gender")
    .then(rows => {
      res.json({ genders: rows.map(e => e.gender) });
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ message: "Error in mySQL query" });
    });
});

/* GET years */
router.get("/years", (req, res, next) => {
  req.db
    .from("offences")
    .distinct("year")
    .then(rows => {
      res.json({ years: rows.map(e => e.year) });
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ message: "Error in mySQL query" });
    });
});

/* GET months */
router.get("/months", (req, res, next) => {
  req.db
    .from("offences")
    .distinct("month")
    .then(rows => {
      res.json({ months: rows.map(e => e.month) });
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ message: "Error in mySQL query" });
    });
});

module.exports = router;
