//stores the tenants and users ina  single document
var hasher = require('password-hash-and-salt');
var kwaaiCrudware=require('kwaai-crudware');
var kwaaiCrud=require("kwaai-crud");
var kwaaiSchema=require("kwaai-schema");

var _globalOptions={};

var multiTenantTools={
    createTenant:
        function(req,res,next){
            function passwordHashed(err,hash) {
                function tenantCreated(err, tenant) {
                    if (err) {
                        return next(err)
                    }
                    return res.send(200, tenant)
                }

                var tenantToCreate=req.body;
                tenantToCreate.users=[
                    {
                        email:req.body.adminUser.email,
                        password:hash,
                        roles:[_globalOptions.tenantAdminRole]
                    }
                ]

                delete tenantToCreate.adminUser;
                kwaaiCrud.insert({collection:_globalOptions.tenantsCollection,schema:_globalOptions.schemas.storage,data:tenantToCreate},tenantCreated)

            }
            var invalid=kwaaiSchema.validateToSchema(req.body,_globalOptions.schemas.create)
            if (invalid){return res.send(400,invalid)}

            //todo check if tenant name exists
            hasher(req.body.adminUser.password).hash(passwordHashed)
        }

    ,getTenantById:
        function(req,res,next){
            req.kwaaioptions={
                collection:_globalOptions.tenantsCollection,
                sendresponse:true
            }

            kwaaiCrudware.getById(req,res,next);
        }

    ,getTenantsByQuery:
        function(req,res,next){
            req.kwaaioptions={
                collection:_globalOptions.tenantsCollection,
                sendresponse:true
            }

            kwaaiCrudware.getByQuery(req,res,next);
        }

    ,updateTenantFull:
        function(req,res,next){

            req.kwaaioptions={
                collection:_globalOptions.tenantsCollection,
                schema:tenantSchema,
                sendresponse:true
            }

            kwaaiCrudware.updateFull(req,res,next);

        }

    ,updateTenantPart:
        function(req,res,next){

            req.kwaaioptions={
                collection:_globalOptions.tenantsCollection,
                schema:tenantSchema,
                sendresponse:true
            }

            kwaaiCrudware.updatePart(req,res,next);

        }

    ,deleteTenant:
        function(req,res,next){
            req.kwaaioptions={
                collection:_globalOptions.tenantsCollection,
                sendresponse:true
            }

            kwaaiCrudware.delete(req,res,next);

        }

    ,checkTenantExists:
        function(req,res,next){
            function tenantRetrieved(err,tenant){
                if (err){return next(err)}
                if (tenant){return res.send(409,_globalOptions.name + " name exists")}
                next();
            }
            if (req.params.id){
                kwaaiCrud.getByQuery({collection: _globalOptions.tenantsCollection, rawQuery: {"name": req.body.name.toLowerCase(),_id:{$ne:new mongo.ObjectID(req.params.id)}}}, tenantRetrieved)
            }else {
                kwaaiCrud.getByQuery({collection: _globalOptions.tenantsCollection, rawQuery: {"name": req.body.name.toLowerCase()}}, tenantRetrieved)
            }
        }

    ,addAdminTenant:
        function(req,res,next){
            function adminRetrieved(err,adminTenant){
                if(err){return next(err)}
                req.body[_globalOptions.name + "_id"]=adminTenant._id;
                next();
            }
            multiTenantTools.getTenantbyName("admin",adminRetrieved)
        }

    ,resetPassword:
        function(req,res,next){


        }

    ,updatePassword:
        function(req,res,next){

        }

    ,getUsers:
        function(req,res,next){
            function tenantRetrieved(err,tenant){
                if (err) {return next(err)}
                if (!tenant){return res.send(404,"tenant not found")}
                for (var i=0;i<tenant.users.length;i++){
                    delete tenant.users[i].password;
                }
                return res.send(200,tenant.users);
            }
            getTenantbyName(req[_globalOptions.name].name,tenantRetrieved);
        }

    ,createUser:
        function (req,res,next){
            function tenantRetrieved(err,tenant){
                function userAdded(err,addedTenant){
                    if (err) {return next(err)}
                    console.log("User created");
                    res.send(204);
                }

                if (err) {return next(err)}
                if(!tenant){return res.send(404,_globalOptions.name + " not found.")}
                for (var i=0;i<tenant.users.length;i++){
                    if (tenant.users[i].email.toLowerCase()==req.body.email.toLowerCase()){
                        return res.send(409,"User exists");
                    }
                }

                hasher(req.body.password).hash(function(error, hash) {

                    var newUser={
                        email:req.body.email,
                        password:hash
                    }

                    if (req.body.roles){newUser.roles=req.body.roles}
                    if (req.body.additonalInfo){newUser.additonalInfo=req.body.additonalInfo}

                    tenant.users.push(newUser);

                    kwaaiCrud.updateFull({collection:_globalOptions.tenantsCollection,schema:_globalOptions.schemas.storage,id:tenant._id,data:tenant},userAdded)
                });
            }
            console.log("creating new user...");
            var invalid=kwaaiSchema.validateToSchema(req.body,_globalOptions.schemas.user)
            if (invalid){return res.send(400,invalid)}

            kwaaiCrud.getById({collection: _globalOptions.tenantsCollection, id:req[_globalOptions.name]._id}, tenantRetrieved)
        }

    ,deleteUser:
        function(req,res,next){
            function tenantRetrieved(err,tenant){
                function userDeleted(err){
                    if (err) {return next(err)}
                    res.send(200);
                }

                if (err) {return next(err)}
                if(!tenant){return res.send(404,tenantOptions.name + " not found.")}

                var foundUser=-1;
                for (var i=0;i<tenant.users.length;i++){
                    if (tenant.users[i].email.toLowerCase()==req.email.toLowerCase()){
                        foundUser=i;
                        break;
                    }
                }
                if (foundUser==-1){return res.send(404,"user not found.")}
                tenant.users.splice(foundUser,1);

                kwaaiCrud.updateFull({collection:_globalOptions.tenantsCollection,schema:tenantOptions.schemas.storage,data:tenant},userDeleted)
            }
            kwaaiCrud.getById({collection: _globalOptions.tenantsCollection, id:req.params.id,query:req.query}, tenantRetrieved)
        }

    ,updateUser:
        function(req,res,next){
            function tenantRetrieved(err,tenant){
                function userUpdated(err,result){

                    if (err) {return next(err)}
                    if (result==0){return res.send(304)}
                    res.send(204);
                }

                if (err) {return next(err)}
                if(!tenant){return res.send(404,tenantOptions.name + " not found.")}

                var foundUser=-1;
                for (var i=0;i<tenant.users.length;i++){
                    if (tenant.users[i].email.toLowerCase()==req.email.toLowerCase()){
                        foundUser=i;
                        break;
                    }
                }
                if (foundUser==-1){return res.send(404,"user not found.")}

                req.password=tenant.users[i].password;
                tenant.users[i]=req;

                kwaaiCrud.updateFull({collection:_globalOptions.tenantsCollection,schema:tenantOptions.schemas.storage,data:tenant},userUpdated)
            }


            var invalid=kwaaiSchema.validateToSchema(req.body,tenantOptions.schemas.user)
            if (invalid){return res.send(400,invalid)}
            kwaaiCrud.getById({collection: _globalOptions.tenantsCollection, id:req.params.id,query:req.query}, tenantRetrieved)

        }




    ,checkTenant:
        function(req,res,next){
            function setTenanttoReq(err,tenant){
                if (err){return next(err)}
                if (tenant==null){return res.send(404,"Invalid " + _globalOptions.name + " name")}

                console.log("tenant " + tenant.name + " found");

                //todo active
                req[_globalOptions.name]={
                    _id:tenant._id,
                    name:tenant.name
                }

                req.body[_globalOptions.name+ "_id"]=tenant._id;
                req.body[_globalOptions.name+ "_name"]=tenant.name;

                if (!req.query){req.query={}}
                req.query[_globalOptions.name+ "_id"]=tenant._id;

                return next();
            }

            var tenantNameEnd = req.url.indexOf('/', 1);
            var tenantName="";
            if (tenantNameEnd==-1){
                tenantName = req.url.substring(1);
            }
            else {
                tenantName = req.url.substring(1, tenantNameEnd);
            }
            if (!tenantName||tenantName==""){return res.send(404,"Invalid " + _globalOptions.name + " name")}

            console.log("checking security for tenant " + tenantName);
            getTenantbyName(tenantName,setTenanttoReq)
        }

    ,checkUser:
        //tenantName,userName,password
        function(options,callback){

            var userToVerify=null;

            function tenantRetrieved(err,tenant){

                function hashedChecked(error, verified){
                    if (error) {console.error(error);return callback(error)}

                    if (!verified){
                        console.log("user not verified");
                        return callback(null,null);
                    } else {
                        console.log("user verified");
                        delete userToVerify.password;
                        return callback(null, userToVerify);
                    }
                }

                if (err){return callback(err)}
                var found = false;
                var lowerUsername = options.userName.toLowerCase();
                for (var i=0;i<tenant.users.length;i++){
                    var currentUser=tenant.users[i];
                    if (currentUser.email==lowerUsername){
                        console.log("found user " + currentUser.email);
                        found = true;
                        userToVerify = currentUser;
                        hasher(options.password).verifyAgainst(currentUser.password,hashedChecked);
                        break;
                    }
                }
                if (!found){
                    console.log("no user found" + currentUser.email);
                    return callback(null,null);
                }
            }

            getTenantbyName(options.tenantName,tenantRetrieved)
        }

    ,addSecurityRoutes:
        function(app){
            app.get("/admin/" + _globalOptions.plural,kwaaiCrudware.onlyForRoles([_globalOptions.adminRole]),multiTenantTools.getTenantsByQuery);
            app.post("/admin/" + _globalOptions.plural,kwaaiCrudware.onlyForRoles([_globalOptions.adminRole]),multiTenantTools.checkTenantExists,multiTenantTools.createTenant);
            app.get("/:" +  _globalOptions.name + "/users",kwaaiCrudware.onlyForRoles([_globalOptions.tenantAdminRole]),multiTenantTools.getUsers);
            app.post("/:" + _globalOptions.name + "/users",kwaaiCrudware.onlyForRoles([_globalOptions.tenantAdminRole]),multiTenantTools.createUser);

        }
}


var service= function(options){
    _globalOptions=options;
    return multiTenantTools;
}

module.exports=service;


function getTenantbyName(name,callback){
    function tenantRetrieved(err,tenants){
        if (err){return callback(err)}
        if(!tenants){return callback(null,null)}
        if(tenants.length==0){return callback(null,null)}
        return callback(null,tenants[0])
    }
    kwaaiCrud.getByQuery({collection:_globalOptions.tenantsCollection,query:{"name":name.toLowerCase()}},tenantRetrieved)
}